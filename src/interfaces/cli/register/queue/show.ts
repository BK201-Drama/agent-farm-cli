import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../../domain/task/queue-workspace-paths.js";
import {
  buildTaskTimeline,
  readExecuteReportsForTask,
} from "../../../../application/facades/task-timeline.js";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import {
  print,
  type OutputFormat,
  printTaskText,
} from "../../print.js";
import { createCliQueueContainer } from "../../default-queue-container.js";

export function registerQueueShow(queue: Command): void {
  queue
    .command("show")
    .argument("<task-id>", "task ID to show")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("-f, --format <format>", "output format: json, text, table", "json")
    .option("--with-execute-reports", "include execute-*.json under runs_dir")
    .option("--timeline", "merge task events + execute reports (implies execute reports)")
    .action(async (taskId, opts) => {
      const container = createCliQueueContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const task = await container.queueService.getTask(String(taskId));
      const format: OutputFormat = opts.format === "text" || opts.format === "table" ? opts.format : "json";
      const wantReports = Boolean(opts.withExecuteReports || opts.timeline);
      if (format === "json") {
        const executeReportBodies =
          wantReports && task
            ? readExecuteReportsForTask(w.runsDirDefault, String(taskId))
            : undefined;
        const timeline =
          opts.timeline && task
            ? buildTaskTimeline(
                String(taskId),
                await container.eventRepo.list(),
                executeReportBodies ?? [],
              )
            : undefined;
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
          ...(executeReportBodies ? { execute_reports: executeReportBodies } : {}),
          ...(timeline ? { timeline } : {}),
        });
      } else if (task) {
        printTaskText([task]);
      }
    });
}
