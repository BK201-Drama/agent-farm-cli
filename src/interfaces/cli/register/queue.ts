import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import { print } from "../print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { parseStatus } from "../env-parse.js";
import { createDefaultStorageContainer } from "../compose.js";

export function registerQueueCommands(program: Command): void {
  const queue = program.command("queue");
  queue
    .command("add")
    .option("--task-json <json>", "task as json (omit when using --prompt)")
    .option("--prompt <text>", "build execute task without hand-rolled json")
    .option("--task-id <id>", "with --prompt (default task-<timestamp>)")
    .option("--dedupe-key <key>", "with --prompt (default manual:<task-id>)")
    .option("--priority <n>", "with --prompt: higher claims first (default 0)", "0")
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
          priority: Number(opts.priority) || 0,
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
      const w = resolveQueueWorkspace(process.cwd());
      print({
        ok: true,
        queue_workspace: {
          cwd: w.cwd,
          storage: w.storage,
          db_file: w.dbFile,
          task_file: w.taskFile,
          event_file: w.eventFile,
          quarantine_file: w.quarantineFile,
          runs_dir_default: w.runsDirDefault,
        },
        tasks: await container.queueService.listTasks(),
      });
    });

  queue
    .command("snapshot")
    .description("one-shot board snapshot JSON (pipeline/history partition)")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const w = resolveQueueWorkspace(process.cwd());
      const body = await container.insightsService.buildBoardSnapshot();
      print({ ...body, queue_workspace: w });
    });

  queue
    .command("export")
    .description("dump tasks + events JSON (large; redirect to file)")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const w = resolveQueueWorkspace(process.cwd());
      const body = await container.insightsService.buildExportDump();
      print({ ...body, queue_workspace: w });
    });

  queue
    .command("events")
    .description("print last N event records (JSON array)")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--limit <n>", "tail count", "80")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const w = resolveQueueWorkspace(process.cwd());
      const events = await container.insightsService.listRecentEvents(Number(opts.limit));
      print({ ok: true, queue_workspace: w, events });
    });

  queue
    .command("batch-cancel")
    .description("cancel tasks whose current status is in the given set (comma-separated)")
    .requiredOption("--from-status <csv>", "e.g. queued,retry or running,claimed")
    .option("--reason <text>", "stored on task as last_error", "batch-cancel")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const w = resolveQueueWorkspace(process.cwd());
      const from = String(opts.fromStatus)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await container.queueService.batchCancel(from, String(opts.reason));
      print({ ...result, queue_workspace: w });
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
