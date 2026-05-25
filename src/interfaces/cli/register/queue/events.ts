import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../../domain/task/queue-workspace-paths.js";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueEvents(queue: Command): void {
  queue
    .command("events")
    .description("print last N event records (JSON array)")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--limit <n>", "tail count", "80")
    .action(async (opts) => {
      const container = await queueCliContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const events = await container.insightsService.listRecentEvents(Number(opts.limit));
      print({ ok: true, queue_workspace: w, events });
    });
}
