import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../../domain/task/queue-workspace-paths.js";
import { asTaskStatus, TASK_STATUSES, type TaskStatus } from "../../../../domain/task.js";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print, type OutputFormat, printTask } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueList(queue: Command): void {
  queue
    .command("list")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--status <csv>", `filter by status (comma-separated: ${TASK_STATUSES.join(", ")})`)
    .option("--limit <n>", "maximum tasks to return")
    .option("-f, --format <format>", "output format: json, text, table", "json")
    .action(async (opts) => {
      const container = queueCliContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const listOpts: { statuses?: TaskStatus[]; limit?: number } = {};
      if (opts.status) {
        listOpts.statuses = String(opts.status)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => asTaskStatus(s));
      }
      if (opts.limit !== undefined) {
        listOpts.limit = Number(opts.limit) || undefined;
      }
      const tasks = await container.queueService.listTasks(listOpts);
      const format: OutputFormat = opts.format === "text" || opts.format === "table" ? opts.format : "json";
      if (format === "json") {
        print({
          ok: true,
          queue_workspace: {
            cwd: w.cwd,
            storage: w.storage,
            db_file: w.dbFile,
            task_file: w.taskFile,
            event_file: w.eventFile,
            quarantine_file: w.quarantineFile,
            runs_dir_default: w.runsDirDefault,
          },
          tasks,
        });
      } else {
        printTask(format, tasks);
      }
    });
}
