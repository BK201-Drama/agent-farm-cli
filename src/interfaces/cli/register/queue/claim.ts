import type { Command } from "commander";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueClaim(queue: Command): void {
  queue
    .command("claim")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--limit <n>", "claim count", "1")
    .action(async (opts) => {
      const container = queueCliContainer({ taskFile: String(opts.taskFile) });
      print({ ok: true, claimed: await container.queueService.claimTasks(Number(opts.limit)) });
    });
}
