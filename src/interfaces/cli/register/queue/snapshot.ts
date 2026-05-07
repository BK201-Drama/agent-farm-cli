import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../../domain/task/queue-workspace-paths.js";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueSnapshot(queue: Command): void {
  queue
    .command("snapshot")
    .description("one-shot board snapshot JSON (pipeline/history partition)")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = queueCliContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const body = await container.insightsService.buildBoardSnapshot();
      print({ ...body, queue_workspace: w });
    });
}
