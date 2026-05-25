import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../../domain/task/queue-workspace-paths.js";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueExport(queue: Command): void {
  queue
    .command("export")
    .description("dump tasks + events JSON (large; redirect to file)")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = await queueCliContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const body = await container.insightsService.buildExportDump();
      print({ ...body, queue_workspace: w });
    });
}
