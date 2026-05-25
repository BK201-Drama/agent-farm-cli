import { join } from "node:path";
import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import { formatBriefFailureErrorLines, formatStatusCountsLine, writeCliBriefToStderr } from "../brief-stderr.js";
import { print, writePrettyJsonReportIfPath } from "../print.js";
import { DEFAULT_EVENT_FILE, DEFAULT_TASK_FILE } from "../defaults.js";
import { createCliQueueContainer } from "../default-queue-container.js";
import { resolveGitTopLevel } from "../../../infrastructure/git/agent-farm-worktree.js";

function printBrief(report: Record<string, unknown>): void {
  const lines: string[] = [];
  lines.push(`tasks: ${report.tasks_total ?? 0}, events: ${report.events_total ?? 0}`);
  const statusCounts = report.status_counts as Record<string, number> | undefined;
  const statusLine = formatStatusCountsLine(statusCounts);
  if (statusLine) {
    lines.push(statusLine);
  }
  lines.push(
    ...formatBriefFailureErrorLines(
      report.failure_top as Array<{ error: string; count: number }> | undefined,
      "top failures:",
    ),
  );
  const dur = report.duration_summary as
    | {
        count: number;
        avg_sec: number;
        p50_sec: number;
        p95_sec: number;
        max_sec: number;
      }
    | undefined;
  if (dur && dur.count > 0) {
    lines.push(
      `duration: count=${dur.count}, avg=${dur.avg_sec.toFixed(1)}s, p50=${dur.p50_sec.toFixed(1)}s, p95=${dur.p95_sec.toFixed(1)}s, max=${dur.max_sec.toFixed(1)}s`,
    );
  }
  const tasksTotal = Number(report.tasks_total ?? 0);
  const pipelineActive = ["queued", "retry", "claimed", "running", "review", "approved"].some(
    (s) => (statusCounts?.[s] ?? 0) > 0,
  );
  if (tasksTotal === 0 || !pipelineActive) {
    lines.push(`next: agent-farm queue list | agent-farm queue add --prompt "…" | agent-farm dashboard`);
  }
  writeCliBriefToStderr(lines);
}

export function registerInsightsCommand(program: Command): void {
  program
    .command("insights")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .option("--brief", "print human-readable summary to stderr instead of JSON")
    .action(async (opts) => {
      const container = await createCliQueueContainer({
        taskFile: String(opts.taskFile),
        eventFile: String(opts.eventFile),
      });
      const w = resolveQueueWorkspace(process.cwd());
      const gitTop = resolveGitTopLevel(w.cwd);
      const worktreeBasePath = gitTop ? join(gitTop, ".agent-farm", "worktrees") : undefined;
      const report = await container.insightsService.build(Number(opts.topN), gitTop, worktreeBasePath ?? null);
      const merged = { ...report, queue_workspace: w };
      if (opts.brief) {
        printBrief(merged);
        return;
      }
      await writePrettyJsonReportIfPath(opts.outputFile, merged);
      print(merged);
    });
}
