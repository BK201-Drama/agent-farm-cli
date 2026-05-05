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

export function registerInsightsCommand(program: Command): void {
  program
    .command("insights")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: String(opts.eventFile),
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const w = resolveQueueWorkspace(process.cwd());
      const report = await container.insightsService.build(Number(opts.topN));
      const merged = { ...report, queue_workspace: w };
      if (String(opts.outputFile)) {
        await writeFile(String(opts.outputFile), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      }
      print(merged);
    });
}
