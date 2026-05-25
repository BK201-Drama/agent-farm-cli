import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../../domain/task/queue-workspace-paths.js";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueBatchCancel(queue: Command): void {
  queue
    .command("batch-cancel")
    .description("cancel tasks whose current status is in the given set (comma-separated)")
    .requiredOption("--from-status <csv>", "e.g. queued,retry or running,claimed")
    .option("--reason <text>", "stored on task as last_error", "batch-cancel")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = await queueCliContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const from = String(opts.fromStatus)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await container.queueService.batchCancel(from, String(opts.reason));
      print({ ...result, queue_workspace: w });
    });
}
