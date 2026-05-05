import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
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
      const report = await container.insightsService.build(Number(opts.topN));
      if (String(opts.outputFile)) {
        await writeFile(String(opts.outputFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      }
      print(report);
    });
}
