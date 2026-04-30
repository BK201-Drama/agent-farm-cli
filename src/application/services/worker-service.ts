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

async function runTask(command: string): Promise<{ exitCode: number; output: string }> {
  return await new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d: Buffer) => {
      output += String(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      output += String(d);
    });
    child.on("close", (code: number | null) => resolve({ exitCode: code ?? 1, output }));
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
        const result = await runTask(cmd);
        const success = result.exitCode === 0;
        if (!success) {
          const attempt = Number(task.attempt ?? 0);
          await opts.queueService.updateStatus(String(task.task_id), "retry", {
            attempt: attempt + 1,
            last_error: result.output.slice(0, 3000),
          });
          await opts.eventRepo.append({
            ts: nowIso(),
            event: "task_retry",
            task_id: task.task_id,
            attempt: attempt + 1,
          });
          return;
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
