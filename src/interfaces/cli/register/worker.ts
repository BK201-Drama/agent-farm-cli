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
    .option(
      "--workspace <path>",
      "repo root (--workspace); {workspace}/AGENT_FARM_WORKSPACE 在 git-worktree 模式下为任务检出目录，否则即此路径",
      process.cwd()
    )
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
    .option("--drain-idle-loops <n>", "consecutive empty-claim cycles before exiting 0; 0=never drain", "3")
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .option("--poison-max-attempts <n>", "poison threshold", "3")
    .option(
      "--no-auto-approve-review",
      "leave tasks in review for manual queue review-approve (default: auto mark done after successful run)"
    )
    .option(
      "--git-worktree-parallel",
      "use a dedicated git worktree + branch agent-farm/<task-id> under .agent-farm/worktrees (default: on; requires git; templates should use AGENT_FARM_WORKSPACE_ROOT for npx --prefix)",
      true,
    )
    .option(
      "--shared-workspace",
      "disable worktrees: all tasks run in the same --workspace directory (non-git trees or intentional shared checkout)",
      false,
    )
    .option(
      "--opencode-json-events",
      "parse OpenCode run --format json (NDJSON) during execute; on failure append [opencode-heal] and emit task_opencode_stream_diag (or set AGENT_FARM_OPENCODE_JSON_EVENTS=1)",
      false,
    )
    .option(
      "--isolate-opencode-db",
      "set per-task OPENCODE_DB under <workspace>/.agent-farm/opencode-db/ to reduce SQLite WAL contention when running multiple opencode-ai workers (or set AGENT_FARM_ISOLATE_OPENCODE_DB=1)",
      false,
    )
    .option(
      "--auto-merge",
      "after task reaches done (git worktree mode): merge agent-farm/<task> into the repo's current checked-out branch; serialized across workers, ordered by completion time; default merge --no-ff, or AGENT_FARM_AUTO_MERGE_STRATEGY=rebase for rebase+ff-only (or set AGENT_FARM_AUTO_MERGE=1)",
      false,
    )
    .action(async (opts) => {
      const opencodeJsonEvents =
        Boolean(opts.opencodeJsonEvents) ||
        process.env.AGENT_FARM_OPENCODE_JSON_EVENTS === "1" ||
        process.env.AGENT_FARM_OPENCODE_JSON_EVENTS === "true";
      const isolateOpencodeDb =
        Boolean(opts.isolateOpencodeDb) ||
        process.env.AGENT_FARM_ISOLATE_OPENCODE_DB === "1" ||
        process.env.AGENT_FARM_ISOLATE_OPENCODE_DB === "true";
      const autoMergeWorktree =
        Boolean(opts.autoMerge) ||
        process.env.AGENT_FARM_AUTO_MERGE === "1" ||
        process.env.AGENT_FARM_AUTO_MERGE === "true";
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
        drainIdleLoops: Number(opts.drainIdleLoops),
        poisonMaxAttempts: Number(opts.poisonMaxAttempts),
        autoApproveReview: !Boolean(opts.noAutoApproveReview),
        runShell: runShellCommand,
        clock: systemIsoClock,
        gitWorktreeParallel: Boolean(opts.gitWorktreeParallel) && !Boolean(opts.sharedWorkspace),
        opencodeJsonEvents,
        isolateOpencodeDb,
        autoMergeWorktree,
      });
      print({ ok: true });
    });
}
