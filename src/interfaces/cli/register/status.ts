import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import { print } from "../print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { createDefaultStorageContainer } from "../../../bootstrap/default-storage-container.js";

function printBrief(report: Record<string, unknown>): void {
  const lines: string[] = [];
  lines.push(`tasks: ${report.tasks_total ?? 0} total`);
  const statusCounts = report.status_counts as Record<string, number> | undefined;
  if (statusCounts) {
    const statusLine = Object.entries(statusCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([s, c]) => `${s}=${c}`)
      .join(", ");
    lines.push(`status: ${statusLine}`);
  }
  const hotspots = report.failure_hotspots as Array<{ reason: string; count: number }> | undefined;
  if (hotspots && hotspots.length > 0) {
    lines.push(`failure hotspots:`);
    for (const h of hotspots.slice(0, 5)) {
      lines.push(`  [${h.count}] ${h.reason.slice(0, 80)}${h.reason.length > 80 ? "…" : ""}`);
    }
  }
  process.stderr.write(`${lines.join("\n")}\n`);
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .option("--brief", "print human-readable summary to stderr instead of JSON")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const w = resolveQueueWorkspace(process.cwd());
      const report = await container.statusService.build(Number(opts.topN));
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
