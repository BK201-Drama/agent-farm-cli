import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import { print } from "../print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { createDefaultStorageContainer } from "../compose.js";

function printBrief(report: Record<string, unknown>): void {
  const lines: string[] = [];
  lines.push(`tasks: ${report.tasks_total ?? 0}, events: ${report.events_total ?? 0}`);
  const statusCounts = report.status_counts as Record<string, number> | undefined;
  if (statusCounts) {
    const statusLine = Object.entries(statusCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([s, c]) => `${s}=${c}`)
      .join(", ");
    lines.push(`status: ${statusLine}`);
  }
  const failureTop = report.failure_top as Array<{ error: string; count: number }> | undefined;
  if (failureTop && failureTop.length > 0) {
    lines.push(`top failures:`);
    for (const f of failureTop.slice(0, 5)) {
      lines.push(`  [${f.count}] ${f.error.slice(0, 80)}${f.error.length > 80 ? "…" : ""}`);
    }
  }
  const dur = report.duration_summary as { count: number; avg_sec: number; p50_sec: number; p95_sec: number; max_sec: number } | undefined;
  if (dur && dur.count > 0) {
    lines.push(`duration: count=${dur.count}, avg=${dur.avg_sec.toFixed(1)}s, p50=${dur.p50_sec.toFixed(1)}s, p95=${dur.p95_sec.toFixed(1)}s, max=${dur.max_sec.toFixed(1)}s`);
  }
  process.stderr.write(`${lines.join("\n")}\n`);
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
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: String(opts.eventFile),
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const w = resolveQueueWorkspace(process.cwd());
      const report = await container.insightsService.build(Number(opts.topN));
      const merged = { ...report, queue_workspace: w };
      if (opts.brief) {
        printBrief(merged);
        return;
      }
      if (String(opts.outputFile)) {
        await writeFile(String(opts.outputFile), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      }
      print(merged);
    });
}
