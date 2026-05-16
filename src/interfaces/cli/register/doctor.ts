import type { Command } from "commander";
import { DEFAULT_QUARANTINE_FILE, DEFAULT_TASK_FILE } from "../defaults.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .option("--review-overdue-hours <n>", "review overdue threshold", "2")
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .option("--brief", "print human-readable summary to stderr instead of JSON")
    .option(
      "--ci-exit",
      "after JSON output, exit 1 if doctor finds CI-relevant problems (incompatible with --brief)",
      false,
    )
    .action(async (opts) => {
      const { runDoctorCli } = await import("./doctor-action.js");
      await runDoctorCli({
        taskFile: String(opts.taskFile),
        quarantineFile: String(opts.quarantineFile),
        leaseTimeoutSeconds: String(opts.leaseTimeoutSeconds),
        reviewOverdueHours: String(opts.reviewOverdueHours),
        topN: String(opts.topN),
        outputFile: String(opts.outputFile),
        brief: Boolean(opts.brief),
        ciExit: Boolean(opts.ciExit),
      });
    });
}
