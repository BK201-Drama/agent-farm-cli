import type { Command } from "commander";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueReviewCommands(queue: Command): void {
  queue
    .command("review-approve")
    .requiredOption("--task-id <id>", "task id")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--reviewer <name>", "reviewer", "manager")
    .option("--notes <text>", "review notes", "")
    .option("--spawn-execute", "spawn execute task for plan task", false)
    .action(async (opts) => {
      const container = await queueCliContainer({ taskFile: String(opts.taskFile) });
      print(
        await container.queueService.reviewApprove(
          String(opts.taskId),
          String(opts.reviewer),
          String(opts.notes),
          Boolean(opts.spawnExecute),
        ),
      );
    });

  queue
    .command("review-reject")
    .requiredOption("--task-id <id>", "task id")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--reviewer <name>", "reviewer", "manager")
    .option("--reason <text>", "reject reason", "")
    .option("--move-to-retry", "move to retry after rejection", false)
    .action(async (opts) => {
      const container = await queueCliContainer({ taskFile: String(opts.taskFile) });
      print(
        await container.queueService.reviewReject(
          String(opts.taskId),
          String(opts.reviewer),
          String(opts.reason),
          Boolean(opts.moveToRetry),
        ),
      );
    });
}
