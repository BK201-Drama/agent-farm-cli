import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { print } from "../cli-print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { createDefaultStorageContainer } from "../storage-container.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .option("--review-overdue-hours <n>", "review overdue threshold", "2")
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: String(opts.quarantineFile),
      });
      const report = await container.doctorService.build(
        Number(opts.leaseTimeoutSeconds),
        Number(opts.reviewOverdueHours),
        Number(opts.topN)
      );
      if (String(opts.outputFile)) {
        await writeFile(String(opts.outputFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      }
      print(report);
    });
}
