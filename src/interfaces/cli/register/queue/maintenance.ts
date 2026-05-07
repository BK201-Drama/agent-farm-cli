import type { Command } from "commander";
import { DEFAULT_QUARANTINE_FILE, DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueMaintenanceCommands(queue: Command): void {
  queue
    .command("recover-stale")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .action(async (opts) => {
      const container = queueCliContainer({ taskFile: String(opts.taskFile) });
      print(await container.queueService.recoverStale(Number(opts.leaseTimeoutSeconds)));
    });

  queue
    .command("quarantine-poison")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--max-attempts <n>", "poison threshold attempts", "3")
    .action(async (opts) => {
      const container = queueCliContainer({
        taskFile: String(opts.taskFile),
        quarantineFile: String(opts.quarantineFile),
      });
      print(await container.queueService.quarantinePoison(Number(opts.maxAttempts)));
    });
}
