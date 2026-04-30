#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import {
  addTask,
  claimTasks,
  listTasks,
  quarantinePoison,
  recoverStale,
  reviewApprove,
  reviewReject,
  updateStatus,
} from "./lib/queue.js";
import { runWorkerLoop } from "./lib/worker.js";
import { buildInsights } from "./lib/insights.js";
import { buildDoctorReport } from "./lib/doctor.js";

const DEFAULT_TASK_FILE = `${process.cwd()}/.agent-farm/queue/tasks.jsonl`;
const DEFAULT_EVENT_FILE = `${process.cwd()}/.agent-farm/queue/events.jsonl`;
const DEFAULT_QUARANTINE_FILE = `${process.cwd()}/.agent-farm/queue/quarantine_tasks.jsonl`;

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

const program = new Command();
program.name("agent-farm").description("Parallel agent farm CLI").version("0.1.0");

const queue = program.command("queue");
queue
  .command("add")
  .requiredOption("--task-json <json>", "task json object")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => {
    const task = JSON.parse(String(opts.taskJson ?? "{}")) as Record<string, unknown>;
    const row = await addTask(String(opts.taskFile), task);
    print({ ok: true, task: row });
  });

queue
  .command("list")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => print({ ok: true, tasks: await listTasks(String(opts.taskFile)) }));

queue
  .command("claim")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--limit <n>", "claim count", "1")
  .action(async (opts) =>
    print({ ok: true, claimed: await claimTasks(String(opts.taskFile), Number(opts.limit)) })
  );

queue
  .command("update")
  .requiredOption("--task-id <id>", "task id")
  .requiredOption("--status <status>", "next status")
  .option("--extra-json <json>", "extra fields", "{}")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => {
    const ok = await updateStatus(
      String(opts.taskFile),
      String(opts.taskId),
      String(opts.status),
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
  .action(async (opts) =>
    print(
      await reviewApprove(
        String(opts.taskFile),
        String(opts.taskId),
        String(opts.reviewer),
        String(opts.notes),
        Boolean(opts.spawnExecute)
      )
    )
  );

queue
  .command("review-reject")
  .requiredOption("--task-id <id>", "task id")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--reviewer <name>", "reviewer", "manager")
  .option("--reason <text>", "reject reason", "")
  .option("--move-to-retry", "move to retry after rejection", false)
  .action(async (opts) =>
    print(
      await reviewReject(
        String(opts.taskFile),
        String(opts.taskId),
        String(opts.reviewer),
        String(opts.reason),
        Boolean(opts.moveToRetry)
      )
    )
  );

queue
  .command("recover-stale")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
  .action(async (opts) => print(await recoverStale(String(opts.taskFile), Number(opts.leaseTimeoutSeconds))));

queue
  .command("quarantine-poison")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
  .option("--max-attempts <n>", "poison threshold attempts", "3")
  .action(async (opts) =>
    print(
      await quarantinePoison(String(opts.taskFile), String(opts.quarantineFile), Number(opts.maxAttempts))
    )
  );

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
    await runWorkerLoop({
      taskFile: String(opts.taskFile),
      eventFile: String(opts.eventFile),
      quarantineFile: String(opts.quarantineFile),
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
    const report = await buildInsights(String(opts.taskFile), String(opts.eventFile), Number(opts.topN));
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
    const report = await buildDoctorReport(
      String(opts.taskFile),
      String(opts.quarantineFile),
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
