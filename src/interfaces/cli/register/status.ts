import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import { formatBriefFailureReasonLines, formatStatusCountsLine, writeCliBriefToStderr } from "../brief-stderr.js";
import { print, writePrettyJsonReportIfPath } from "../print.js";
import { DEFAULT_TASK_FILE } from "../defaults.js";
import { createCliQueueContainer } from "../default-queue-container.js";

function printBrief(report: Record<string, unknown>): void {
  const lines: string[] = [];
  lines.push(`tasks: ${report.tasks_total ?? 0} total`);
  const statusCounts = report.status_counts as Record<string, number> | undefined;
  const statusLine = formatStatusCountsLine(statusCounts);
  if (statusLine) {
    lines.push(statusLine);
  }
  lines.push(
    ...formatBriefFailureReasonLines(
      report.failure_hotspots as Array<{ reason: string; count: number }> | undefined,
      "failure hotspots:",
    ),
  );
  writeCliBriefToStderr(lines);
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .option("--brief", "print human-readable summary to stderr instead of JSON")
    .action(async (opts) => {
      const container = await createCliQueueContainer({ taskFile: String(opts.taskFile) });
      const w = resolveQueueWorkspace(process.cwd());
      const report = await container.statusService.build(Number(opts.topN));
      const merged = { ...report, queue_workspace: w };
      if (opts.brief) {
        printBrief(merged);
        return;
      }
      await writePrettyJsonReportIfPath(opts.outputFile, merged);
      print(merged);
    });
}
