import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../../domain/task/queue-workspace-paths.js";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import {
  print,
  type OutputFormat,
  printTaskText,
} from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueShow(queue: Command): void {
  queue
    .command("show")
    .argument("<task-id>", "task ID to show")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("-f, --format <format>", "output format: json, text, table", "json")
    .action(async (taskId, opts) => {
      const container = queueCliContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const task = await container.queueService.getTask(String(taskId));
      const format: OutputFormat = opts.format === "text" || opts.format === "table" ? opts.format : "json";
      if (format === "json") {
        print({
          ok: task !== null,
          queue_workspace: {
            cwd: w.cwd,
            storage: w.storage,
            db_file: w.dbFile,
            task_file: w.taskFile,
            event_file: w.eventFile,
            quarantine_file: w.quarantineFile,
            runs_dir_default: w.runsDirDefault,
          },
          task,
        });
      } else if (task) {
        printTaskText([task]);
      }
    });
}
