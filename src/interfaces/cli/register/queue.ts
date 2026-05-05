import type { Command } from "commander";
import { print } from "../cli-print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { parseStatus } from "../env-parse.js";
import { createDefaultStorageContainer } from "../storage-container.js";

export function registerQueueCommands(program: Command): void {
  const queue = program.command("queue");
  queue
    .command("add")
    .option("--task-json <json>", "task as json (omit when using --prompt)")
    .option("--prompt <text>", "build execute task without hand-rolled json")
    .option("--task-id <id>", "with --prompt (default task-<timestamp>)")
    .option("--dedupe-key <key>", "with --prompt (default manual:<task-id>)")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const taskJsonRaw =
        opts.taskJson !== undefined && opts.taskJson !== null ? String(opts.taskJson).trim() : "";
      let task: Record<string, unknown>;
      if (taskJsonRaw.length > 0) {
        task = JSON.parse(String(opts.taskJson)) as Record<string, unknown>;
      } else if (opts.prompt !== undefined) {
        const taskId = String(opts.taskId ?? `task-${Date.now()}`);
        const dedupe = String(opts.dedupeKey ?? `manual:${taskId}`);
        task = {
          task_id: taskId,
          mode: "execute",
          prompt: String(opts.prompt),
          dedupe_key: dedupe,
        };
      } else {
        throw new Error("queue add: pass --task-json <json> or --prompt <text>");
      }
      const row = await container.queueService.addTask(task);
      print({ ok: true, task: row });
    });

  queue
    .command("list")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      print({ ok: true, tasks: await container.queueService.listTasks() });
    });

  queue
    .command("claim")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--limit <n>", "claim count", "1")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      print({ ok: true, claimed: await container.queueService.claimTasks(Number(opts.limit)) });
    });

  queue
    .command("update")
    .requiredOption("--task-id <id>", "task id")
    .requiredOption("--status <status>", "next status")
    .option("--extra-json <json>", "extra fields", "{}")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const ok = await container.queueService.updateStatus(
        String(opts.taskId),
        parseStatus(String(opts.status)),
        JSON.parse(String(opts.extraJson))
      );
      print({ ok, task_id: opts.taskId, status: opts.status });
    });

  queue
    .command("review-approve")
    .requiredOption("--task-id <id>", "task id")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--reviewer <name>", "reviewer", "manager")
    .option("--notes <text>", "review notes", "")
    .option("--spawn-execute", "spawn execute task for plan task", false)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      print(
        await container.queueService.reviewApprove(
          String(opts.taskId),
          String(opts.reviewer),
          String(opts.notes),
          Boolean(opts.spawnExecute)
        )
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
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      print(
        await container.queueService.reviewReject(
          String(opts.taskId),
          String(opts.reviewer),
          String(opts.reason),
          Boolean(opts.moveToRetry)
        )
      );
    });

  queue
    .command("recover-stale")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      print(await container.queueService.recoverStale(Number(opts.leaseTimeoutSeconds)));
    });

  queue
    .command("quarantine-poison")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--max-attempts <n>", "poison threshold attempts", "3")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: String(opts.quarantineFile),
      });
      print(await container.queueService.quarantinePoison(Number(opts.maxAttempts)));
    });
}
