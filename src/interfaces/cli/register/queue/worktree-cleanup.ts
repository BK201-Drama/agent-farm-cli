import type { Command } from "commander";
import { DEFAULT_TASK_FILE } from "../../defaults.js";

export function registerQueueWorktreeCleanup(queue: Command): void {
  queue
    .command("worktree-cleanup")
    .description("Clean up worktrees whose tasks have been terminal for >24h")
    .option("--dry-run", "show what would be removed without removing", false)
    .option("--force", "skip confirmation before deletion", false)
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--older-than-hours <n>", "cleanup threshold in hours (default: 24)", "24")
    .option("--brief", "print human-readable summary to stderr instead of JSON")
    .action(async (opts) => {
      const { runQueueWorktreeCleanupCli } = await import("./worktree-cleanup-action.js");
      await runQueueWorktreeCleanupCli({
        dryRun: Boolean(opts.dryRun),
        force: Boolean(opts.force),
        taskFile: String(opts.taskFile),
        olderThanHours: opts.olderThanHours,
        brief: Boolean(opts.brief),
      });
    });
}
