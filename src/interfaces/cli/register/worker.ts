import type { Command } from "commander";
import { runWorkerLoop } from "../../../application/facades/worker.js";
import {
  resolveAgentFarmStorageFromEnv,
  resolveQueueWorkspace,
} from "../../../domain/task/queue-workspace-paths.js";
import { systemIsoClock } from "../../../infrastructure/clock/iso-clock.js";
import { runShellCommand } from "../../../infrastructure/process/shell.js";
import { print } from "../print.js";
import { DEFAULT_EVENT_FILE, DEFAULT_QUARANTINE_FILE, DEFAULT_TASK_FILE } from "../defaults.js";
import { createDefaultStorageContainer } from "../compose.js";

export function registerWorkerCommand(program: Command): void {
  program
    .command("worker")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option(
      "--runs-dir <path>",
      "run artifacts dir (default: <workspace>/.agent-farm/runs; legacy tmp dir if you pass an explicit path)"
    )
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
    .option(
      "--no-auto-approve-review",
      "leave tasks in review for manual queue review-approve (default: auto mark done after successful run)"
    )
    .action(async (opts) => {
      const workspaceDir = String(opts.workspace ?? process.cwd());
      const workers = Number(opts.workers);
      if (resolveAgentFarmStorageFromEnv() === "jsonl" && workers > 1) {
        throw new Error(
          "AGENT_FARM_STORAGE=jsonl with --workers > 1 is not supported (list+save races). Use sqlite or --workers 1."
        );
      }
      const runsDirRaw = opts.runsDir !== undefined && opts.runsDir !== null ? String(opts.runsDir).trim() : "";
      const runsDir =
        runsDirRaw.length > 0 ? runsDirRaw : resolveQueueWorkspace(workspaceDir).runsDirDefault;
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: String(opts.eventFile),
        quarantineFile: String(opts.quarantineFile),
      });
      await runWorkerLoop({
        queueService: container.queueService,
        eventRepo: container.eventRepo,
        runsDir,
        workspaceDir,
        workers,
        loopSleepMs: Number(opts.loopSleepMs),
        commandTemplate: String(opts.commandTemplate),
        verifyCommandTemplate: String(opts.verifyCommandTemplate ?? ""),
        aiReviewCommandTemplate: String(opts.aiReviewCommandTemplate ?? ""),
        requireAiReview: Boolean(opts.requireAiReview),
        leaseTimeoutSeconds: Number(opts.leaseTimeoutSeconds),
        poisonMaxAttempts: Number(opts.poisonMaxAttempts),
        autoApproveReview: !Boolean(opts.noAutoApproveReview),
        runShell: runShellCommand,
        clock: systemIsoClock,
      });
      print({ ok: true });
    });
}
