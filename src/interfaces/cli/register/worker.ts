import type { Command } from "commander";
import { runWorkerLoop } from "../../../application/services/worker-service.js";
import { systemIsoClock } from "../../../infrastructure/clock/iso-clock.js";
import { runShellCommand } from "../../../infrastructure/process/shell.js";
import { print } from "../print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_RUNS_DIR,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { createDefaultStorageContainer } from "../compose.js";

export function registerWorkerCommand(program: Command): void {
  program
    .command("worker")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--runs-dir <path>", "run artifacts dir", DEFAULT_RUNS_DIR)
    .option("--workspace <path>", "repo root for {workspace} and AGENT_FARM_WORKSPACE", process.cwd())
    .option("--workers <n>", "parallel workers", "2")
    .option("--loop-sleep-ms <n>", "sleep between loops", "500")
    .option("--command-template <tpl>", "command template", "echo {prompt}")
    .option("--verify-command-template <tpl>", "post-run verification command template", "")
    .option(
      "--ai-review-command-template <tpl>",
      "after verify: AI/semantic acceptance command; non-zero exit triggers retry",
      ""
    )
    .option(
      "--require-ai-review",
      "every task must run AI review (global or per-task template); missing template -> blocked; use skip_ai_review on task to opt out",
      false
    )
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .option("--poison-max-attempts <n>", "poison threshold", "3")
    .option("--auto-approve-review", "auto approve review to done", false)
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: String(opts.eventFile),
        quarantineFile: String(opts.quarantineFile),
      });
      await runWorkerLoop({
        queueService: container.queueService,
        eventRepo: container.eventRepo,
        runsDir: String(opts.runsDir),
        workspaceDir: String(opts.workspace ?? process.cwd()),
        workers: Number(opts.workers),
        loopSleepMs: Number(opts.loopSleepMs),
        commandTemplate: String(opts.commandTemplate),
        verifyCommandTemplate: String(opts.verifyCommandTemplate ?? ""),
        aiReviewCommandTemplate: String(opts.aiReviewCommandTemplate ?? ""),
        requireAiReview: Boolean(opts.requireAiReview),
        leaseTimeoutSeconds: Number(opts.leaseTimeoutSeconds),
        poisonMaxAttempts: Number(opts.poisonMaxAttempts),
        autoApproveReview: Boolean(opts.autoApproveReview),
        runShell: runShellCommand,
        clock: systemIsoClock,
      });
      print({ ok: true });
    });
}
