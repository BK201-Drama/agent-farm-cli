import { join } from "node:path";
import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import { formatBriefFailureErrorLines, formatStatusCountsLine, writeCliBriefToStderr } from "../brief-stderr.js";
import { print, writePrettyJsonReportIfPath } from "../print.js";
import { DEFAULT_EVENT_FILE, DEFAULT_TASK_FILE } from "../defaults.js";
import { createCliQueueContainer } from "../default-queue-container.js";
import { resolveGitTopLevel } from "../../../infrastructure/git/agent-farm-worktree.js";

function printCostBrief(report: Record<string, unknown>): void {
  const cost = (report.cost ?? report) as Record<string, unknown> | undefined;
  if (!cost) {
    writeCliBriefToStderr(["No cost data available."]);
    return;
  }
  const total = cost.total as Record<string, number> | undefined;
  const lines: string[] = [];
  if (total) {
    const dollars = (total.cost_cents ?? 0) / 100;
    lines.push(
      `total: $${dollars.toFixed(2)} (${total.count ?? 0} tasks, ` +
        `${((total.input_tokens ?? 0) / 1000).toFixed(0)}K in / ${((total.output_tokens ?? 0) / 1000).toFixed(0)}K out)`,
    );
  }

  const byModel = cost.by_model as Array<Record<string, unknown>> | undefined;
  if (byModel && byModel.length > 0) {
    lines.push("by model:");
    for (const m of byModel.slice(0, 8)) {
      const d = (Number(m.cost_cents ?? 0) / 100).toFixed(2);
      lines.push(`  ${String(m.model ?? "?")}: $${d} (${m.count ?? 0} tasks)`);
    }
  }

  const byType = cost.by_task_type as Array<Record<string, unknown>> | undefined;
  if (byType && byType.length > 0) {
    lines.push("by task_type:");
    for (const t of byType.slice(0, 5)) {
      const d = (Number(t.cost_cents ?? 0) / 100).toFixed(2);
      lines.push(`  ${String(t.task_type ?? "?")}: $${d} (${t.count ?? 0} tasks)`);
    }
  }

  writeCliBriefToStderr(lines);
}

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

  // Execution memory: failure hotspots
  const hotspots = report.failure_hotspots as
    | Array<{ dedupe_prefix: string; total: number; failed: number }>
    | undefined;
  if (hotspots && hotspots.length > 0) {
    lines.push("failure hotspots:");
    for (const h of hotspots.slice(0, 5)) {
      const rate = h.total > 0 ? ((h.failed / h.total) * 100).toFixed(0) : "0";
      lines.push(`  ${h.dedupe_prefix}: ${h.failed}/${h.total} (${rate}%)`);
    }
  }

  // Execution memory: model recommendations
  const modelRecs = report.model_recommendations as
    | Array<{ task_type: string; best_model: string; success_rate: number; total: number }>
    | undefined;
  if (modelRecs && modelRecs.length > 0) {
    lines.push("model recommendations:");
    for (const r of modelRecs.slice(0, 5)) {
      const pct = (r.success_rate * 100).toFixed(0);
      lines.push(`  ${r.task_type}: ${r.best_model} (${pct}%, n=${r.total})`);
    }
  }

  // Cost anomalies
  const anomalies = report.cost_anomalies as Array<Record<string, unknown>> | undefined;
  if (anomalies && anomalies.length > 0) {
    lines.push("cost anomalies:");
    for (const a of anomalies.slice(0, 5)) {
      const dollars = (Number(a.cost_cents ?? 0) / 100).toFixed(3);
      lines.push(`  [cost-anomaly] ${String(a.task_id ?? "?")}: $${dollars} (${String(a.task_type ?? "?")}/${String(a.model ?? "?")})`);
    }
  }

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
    .option("--cost", "show cost & token aggregation by task_type/model/wave")
    .action(async (opts) => {
      const container = await createCliQueueContainer({
        taskFile: String(opts.taskFile),
        eventFile: String(opts.eventFile),
      });

      if (opts.cost) {
        const report = await container.insightsService.buildCostReport();
        if (opts.brief) {
          printCostBrief(report);
          return;
        }
        await writePrettyJsonReportIfPath(opts.outputFile, report);
        print(report);
        return;
      }

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
