#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { TASK_STATUSES, type TaskStatus } from "../../domain/task.js";
import { runWorkerLoop } from "../../application/services/worker-service.js";
import { createJsonlContainer } from "../../bootstrap/container.js";

const DEFAULT_TASK_FILE = `${process.cwd()}/.agent-farm/queue/tasks.jsonl`;
const DEFAULT_EVENT_FILE = `${process.cwd()}/.agent-farm/queue/events.jsonl`;
const DEFAULT_QUARANTINE_FILE = `${process.cwd()}/.agent-farm/queue/quarantine_tasks.jsonl`;

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function parseStatus(raw: string): TaskStatus {
  if ((TASK_STATUSES as readonly string[]).includes(raw)) {
    return raw as TaskStatus;
  }
  throw new Error(`invalid status: ${raw}`);
}

const program = new Command();
program.name("agent-farm").description("Parallel agent farm CLI").version("0.1.0");

const queue = program.command("queue");
queue
  .command("add")
  .requiredOption("--task-json <json>", "task json object")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    const task = JSON.parse(String(opts.taskJson ?? "{}")) as Record<string, unknown>;
    const row = await container.queueService.addTask(task);
    print({ ok: true, task: row });
  });

queue
  .command("list")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => {
    const container = createJsonlContainer({
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
    const container = createJsonlContainer({
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
    const container = createJsonlContainer({
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
    const container = createJsonlContainer({
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
    const container = createJsonlContainer({
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
    const container = createJsonlContainer({
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
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: String(opts.quarantineFile),
    });
    print(await container.queueService.quarantinePoison(Number(opts.maxAttempts)));
  });

program
  .command("worker")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
  .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
  .option("--runs-dir <path>", "run artifacts dir", "/tmp/agent-farm-runs")
  .option("--workers <n>", "parallel workers", "2")
  .option("--loop-sleep-ms <n>", "sleep between loops", "500")
  .option("--command-template <tpl>", "command template", "echo {prompt}")
  .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
  .option("--poison-max-attempts <n>", "poison threshold", "3")
  .option("--auto-approve-review", "auto approve review to done", false)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: String(opts.eventFile),
      quarantineFile: String(opts.quarantineFile),
    });
    await runWorkerLoop({
      queueService: container.queueService,
      eventRepo: container.eventRepo,
      runsDir: String(opts.runsDir),
      workers: Number(opts.workers),
      loopSleepMs: Number(opts.loopSleepMs),
      commandTemplate: String(opts.commandTemplate),
      leaseTimeoutSeconds: Number(opts.leaseTimeoutSeconds),
      poisonMaxAttempts: Number(opts.poisonMaxAttempts),
      autoApproveReview: Boolean(opts.autoApproveReview),
    });
    print({ ok: true });
  });

program
  .command("insights")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
  .option("--top-n <n>", "top failures", "5")
  .option("--output-file <path>", "write json report to file", "")
  .action(async (opts) => {
    const container = createJsonlContainer({
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

program
  .command("doctor")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
  .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
  .option("--review-overdue-hours <n>", "review overdue threshold", "2")
  .option("--top-n <n>", "top failures", "5")
  .option("--output-file <path>", "write json report to file", "")
  .action(async (opts) => {
    const container = createJsonlContainer({
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

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  print({ ok: false, error: message });
  process.exit(1);
});
