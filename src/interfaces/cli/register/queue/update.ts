import type { Command } from "commander";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { parseStatus } from "../../env-parse.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueUpdate(queue: Command): void {
  queue
    .command("update")
    .requiredOption("--task-id <id>", "task id")
    .requiredOption("--status <status>", "next status")
    .option("--extra-json <json>", "extra fields", "{}")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = await queueCliContainer({ taskFile: String(opts.taskFile) });
      const ok = await container.queueService.updateStatus(
        String(opts.taskId),
        parseStatus(String(opts.status)),
        JSON.parse(String(opts.extraJson)),
      );
      print({ ok, task_id: opts.taskId, status: opts.status });
    });
}
