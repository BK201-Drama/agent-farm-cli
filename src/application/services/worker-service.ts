import { spawn } from "node:child_process";
import { nowIso, type JsonMap } from "../../infrastructure/persistence/jsonl/jsonl-utils.js";
import { ACTIVE_STATUSES, type TaskStatus } from "../../domain/task.js";
import { QueueService } from "./queue-service.js";
import type { EventRepository } from "../../ports/repositories.js";

export type WorkerOptions = {
  queueService: QueueService;
  eventRepo: EventRepository;
  runsDir: string;
  workers: number;
  loopSleepMs: number;
  commandTemplate: string;
  leaseTimeoutSeconds: number;
  poisonMaxAttempts: number;
  autoApproveReview: boolean;
  verifyCommandTemplate?: string;
};

function hasDuplicateDedupe(task: JsonMap, all: JsonMap[]): boolean {
  const key = String(task.dedupe_key ?? "").trim();
  if (!key) return false;
  const taskId = String(task.task_id ?? "");
  return all.some(
    (x) =>
      String(x.task_id ?? "") !== taskId &&
      ACTIVE_STATUSES.has(String(x.status ?? "") as TaskStatus) &&
      String(x.dedupe_key ?? "").trim() === key
  );
}

async function runTask(
  command: string,
  onHeartbeat?: () => Promise<void>,
  heartbeatMs: number = 15000
): Promise<{ exitCode: number; output: string }> {
  return await new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timer: NodeJS.Timeout | null = null;
    if (onHeartbeat) {
      timer = setInterval(() => {
        void onHeartbeat().catch(() => {
          // Best-effort heartbeat: do not fail execution on write race.
        });
      }, heartbeatMs);
    }
    child.stdout.on("data", (d: Buffer) => {
      output += String(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      output += String(d);
    });
    child.on("close", (code: number | null) => {
      if (timer) clearInterval(timer);
      resolve({ exitCode: code ?? 1, output });
    });
  });
}

export async function runWorkerLoop(opts: WorkerOptions): Promise<void> {
  while (true) {
    await opts.queueService.recoverStale(opts.leaseTimeoutSeconds);
    await opts.queueService.quarantinePoison(opts.poisonMaxAttempts);
    const pending = await opts.queueService.claimTasks(opts.workers);
    if (pending.length === 0) break;
    await Promise.all(
      pending.map(async (task) => {
        const allRows = await opts.queueService.listTasks();
        if (hasDuplicateDedupe(task, allRows)) {
          await opts.queueService.updateStatus(String(task.task_id), "blocked", {
            blocked_reason: `duplicate dedupe_key: ${String(task.dedupe_key ?? "")}`,
          });
          await opts.eventRepo.append({
            ts: nowIso(),
            event: "task_deduped_blocked",
            task_id: task.task_id,
            dedupe_key: task.dedupe_key,
          });
          return;
        }
        await opts.queueService.updateStatus(String(task.task_id), "running");
        await opts.eventRepo.append({ ts: nowIso(), event: "task_running", task_id: task.task_id });
        const cmd = opts.commandTemplate
          .replace("{prompt}", JSON.stringify(String(task.prompt ?? "")))
          .replace("{task_id}", String(task.task_id))
          .replace("{runs_dir}", opts.runsDir);
        const result = await runTask(cmd, async () => {
          await opts.queueService.touchHeartbeat(String(task.task_id));
        });
        const success = result.exitCode === 0;
        if (!success) {
          const attempt = Number(task.attempt ?? 0);
          await opts.queueService.updateStatus(String(task.task_id), "retry", {
            attempt: attempt + 1,
            last_error: result.output.slice(0, 3000),
          });
          await opts.eventRepo.append({
            ts: nowIso(),
            event: "task_failed",
            task_id: task.task_id,
            attempt: attempt + 1,
          });
          await opts.eventRepo.append({
            ts: nowIso(),
            event: "task_retry",
            task_id: task.task_id,
            attempt: attempt + 1,
          });
          return;
        }
        if (String(opts.verifyCommandTemplate ?? "").trim()) {
          const verifyCmd = String(opts.verifyCommandTemplate)
            .replace("{prompt}", JSON.stringify(String(task.prompt ?? "")))
            .replace("{task_id}", String(task.task_id))
            .replace("{runs_dir}", opts.runsDir);
          const verifyResult = await runTask(verifyCmd, async () => {
            await opts.queueService.touchHeartbeat(String(task.task_id));
          });
          if (verifyResult.exitCode !== 0) {
            const attempt = Number(task.attempt ?? 0);
            await opts.queueService.updateStatus(String(task.task_id), "retry", {
              attempt: attempt + 1,
              last_error: `verify failed\n${verifyResult.output.slice(0, 3000)}`,
            });
            await opts.eventRepo.append({
              ts: nowIso(),
              event: "task_failed",
              task_id: task.task_id,
              attempt: attempt + 1,
              stage: "verify",
            });
            await opts.eventRepo.append({
              ts: nowIso(),
              event: "task_retry",
              task_id: task.task_id,
              attempt: attempt + 1,
              stage: "verify",
            });
            return;
          }
        }
        await opts.queueService.updateStatus(String(task.task_id), "review", {
          result: { exit_code: 0, output: result.output.slice(0, 3000) },
        });
        await opts.eventRepo.append({ ts: nowIso(), event: "task_review", task_id: task.task_id });
        if (opts.autoApproveReview) {
          await opts.queueService.updateStatus(String(task.task_id), "approved");
          await opts.queueService.updateStatus(String(task.task_id), "done");
          await opts.eventRepo.append({ ts: nowIso(), event: "task_done", task_id: task.task_id });
        }
      })
    );
    await new Promise((r) => setTimeout(r, opts.loopSleepMs));
  }
}
