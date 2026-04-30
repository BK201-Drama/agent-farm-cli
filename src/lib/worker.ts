import { spawn } from "node:child_process";
import { appendJsonl, nowIso, readJsonl, type JsonMap } from "./jsonl.js";
import {
  claimTasks,
  quarantinePoison,
  recoverStale,
  updateStatus,
  ACTIVE_STATUSES,
} from "./queue.js";

export type WorkerOptions = {
  taskFile: string;
  eventFile: string;
  runsDir: string;
  workers: number;
  loopSleepMs: number;
  commandTemplate: string;
  leaseTimeoutSeconds: number;
  poisonMaxAttempts: number;
  quarantineFile: string;
  autoApproveReview: boolean;
};

function hasDuplicateDedupe(task: JsonMap, all: JsonMap[]): boolean {
  const key = String(task.dedupe_key ?? "").trim();
  if (!key) return false;
  const taskId = String(task.task_id ?? "");
  return all.some(
    (x) =>
      String(x.task_id ?? "") !== taskId &&
      ACTIVE_STATUSES.has(String(x.status ?? "")) &&
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
    await recoverStale(opts.taskFile, opts.leaseTimeoutSeconds);
    await quarantinePoison(opts.taskFile, opts.quarantineFile, opts.poisonMaxAttempts);
    const pending = await claimTasks(opts.taskFile, opts.workers);
    if (pending.length === 0) break;
    await Promise.all(
      pending.map(async (task) => {
        const allRows = await readJsonl(opts.taskFile);
        if (hasDuplicateDedupe(task, allRows)) {
          await updateStatus(opts.taskFile, String(task.task_id), "blocked", {
            blocked_reason: `duplicate dedupe_key: ${String(task.dedupe_key ?? "")}`,
          });
          await appendJsonl(opts.eventFile, {
            ts: nowIso(),
            event: "task_deduped_blocked",
            task_id: task.task_id,
            dedupe_key: task.dedupe_key,
          });
          return;
        }
        await updateStatus(opts.taskFile, String(task.task_id), "running");
        await appendJsonl(opts.eventFile, { ts: nowIso(), event: "task_running", task_id: task.task_id });
        const cmd = opts.commandTemplate
          .replace("{prompt}", JSON.stringify(String(task.prompt ?? "")))
          .replace("{task_id}", String(task.task_id))
          .replace("{runs_dir}", opts.runsDir);
        const result = await runTask(cmd);
        const success = result.exitCode === 0;
        if (!success) {
          const attempt = Number(task.attempt ?? 0);
          await updateStatus(opts.taskFile, String(task.task_id), "retry", {
            attempt: attempt + 1,
            last_error: result.output.slice(0, 3000),
          });
          await appendJsonl(opts.eventFile, {
            ts: nowIso(),
            event: "task_retry",
            task_id: task.task_id,
            attempt: attempt + 1,
          });
          return;
        }
        await updateStatus(opts.taskFile, String(task.task_id), "review", {
          result: { exit_code: 0, output: result.output.slice(0, 3000) },
        });
        await appendJsonl(opts.eventFile, { ts: nowIso(), event: "task_review", task_id: task.task_id });
        if (opts.autoApproveReview) {
          await updateStatus(opts.taskFile, String(task.task_id), "approved");
          await updateStatus(opts.taskFile, String(task.task_id), "done");
          await appendJsonl(opts.eventFile, { ts: nowIso(), event: "task_done", task_id: task.task_id });
        }
      })
    );
    await new Promise((r) => setTimeout(r, opts.loopSleepMs));
  }
}
