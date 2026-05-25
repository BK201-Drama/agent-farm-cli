import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveGitTopLevel, sanitizeTaskIdForPath } from "../../../../infrastructure/git/agent-farm-worktree.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled", "blocked", "approved", "rejected"]);

interface WorktreeInfo {
  worktree_id: string;
  path: string;
  branch: string;
  task_id: string | null;
  task_status: string | null;
  completed_at: string | null;
  age_hours: number | null;
  can_cleanup: boolean;
  reason: string;
}

function hoursSince(isoDate: string): number {
  const ms = Date.parse(isoDate);
  if (Number.isNaN(ms)) return 0;
  return (Date.now() - ms) / 3600000;
}

function printBrief(worktrees: WorktreeInfo[], deleted: string[]): void {
  const lines: string[] = [];
  const cleanable = worktrees.filter((w) => w.can_cleanup);
  lines.push(`total worktrees: ${worktrees.length}`);
  lines.push(`cleanable: ${cleanable.length}`);
  lines.push(`orphans: ${worktrees.filter((w) => w.task_id === null).length}`);
  lines.push(`deleted: ${deleted.length}`);
  if (deleted.length > 0) {
    for (const id of deleted) {
      lines.push(`  removed: ${id}`);
    }
  }
  process.stderr.write(`${lines.join("\n")}\n`);
}

export type WorktreeCleanupCliOpts = {
  dryRun: boolean;
  force: boolean;
  taskFile: string;
  olderThanHours: string | number;
  brief: boolean;
};

export async function runQueueWorktreeCleanupCli(opts: WorktreeCleanupCliOpts): Promise<void> {
  const container = await queueCliContainer({ taskFile: String(opts.taskFile) });
  const gitTop = resolveGitTopLevel(process.cwd());
  if (!gitTop) {
    print({ ok: false, error: "not in a git repository" });
    return;
  }

  const worktreeBase = join(gitTop, ".agent-farm", "worktrees");
  if (!existsSync(worktreeBase)) {
    print({ ok: true, worktrees: [], message: "no worktrees directory found" });
    return;
  }

  const tasks = await container.queueService.listTasks({});
  const taskMap = new Map<string, (typeof tasks)[0]>();
  for (const t of tasks) {
    const key = sanitizeTaskIdForPath(String(t.task_id ?? ""));
    taskMap.set(key, t);
  }

  const dirs = readdirSync(worktreeBase);
  const olderThanHours = Number(opts.olderThanHours) || 24;

  const worktrees: WorktreeInfo[] = [];
  for (const dir of dirs) {
    const path = join(worktreeBase, dir);
    const task = taskMap.get(dir);

    if (!task) {
      worktrees.push({
        worktree_id: dir,
        path,
        branch: `agent-farm/${dir}`,
        task_id: null,
        task_status: null,
        completed_at: null,
        age_hours: null,
        can_cleanup: true,
        reason: "orphan worktree (no matching task)",
      });
      continue;
    }

    let canCleanup: boolean;
    let reason: string;
    const status = String(task.status ?? "");
    const completedAt = String(task.completed_at ?? "");
    const ageHours = completedAt ? hoursSince(completedAt) : null;

    if (!TERMINAL_STATUSES.has(status)) {
      canCleanup = false;
      reason = `task is ${status} (active)`;
    } else if (ageHours === null) {
      canCleanup = true;
      reason = `task is ${status} (no completed_at, treating as cleanable)`;
    } else if (ageHours < olderThanHours) {
      canCleanup = false;
      reason = `task is ${status}, completed ${ageHours.toFixed(1)}h ago (< ${olderThanHours}h threshold)`;
    } else {
      canCleanup = true;
      reason = `task is ${status}, completed ${ageHours.toFixed(1)}h ago (> ${olderThanHours}h threshold)`;
    }

    worktrees.push({
      worktree_id: dir,
      path,
      branch: `agent-farm/${dir}`,
      task_id: String(task.task_id ?? null),
      task_status: status || null,
      completed_at: completedAt || null,
      age_hours: ageHours,
      can_cleanup: canCleanup,
      reason,
    });
  }

  const cleanable = worktrees.filter((w) => w.can_cleanup);
  const deleted: string[] = [];

  if (opts.brief) {
    printBrief(worktrees, deleted);
    return;
  }

  if (cleanable.length === 0) {
    print({ ok: true, worktrees, message: "no worktrees to clean" });
    return;
  }

  if (opts.dryRun) {
    print({
      ok: true,
      worktrees,
      dry_run: true,
      cleanable_count: cleanable.length,
      would_delete: cleanable.map((w) => w.worktree_id),
    });
    return;
  }

  if (!opts.force) {
    process.stderr.write(
      `Found ${cleanable.length} cleanable worktrees:\n` +
        cleanable.map((w) => `  [${w.worktree_id}] ${w.reason}`).join("\n") +
        "\n\nProceed with deletion? (y/N) ",
    );
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const answer = await new Promise<string>((resolve) => {
      rl.question("", (a) => {
        rl.close();
        resolve(a);
      });
    });
    if (answer.toLowerCase() !== "y") {
      process.stderr.write("aborted.\n");
      print({ ok: false, worktrees, aborted: true });
      return;
    }
  }

  for (const w of cleanable) {
    try {
      spawnSync("git", ["-C", gitTop, "worktree", "remove", "--force", w.path], {
        encoding: "utf8",
        windowsHide: true,
      });
      if (existsSync(w.path)) {
        try {
          rmSync(w.path, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      deleted.push(w.worktree_id);
    } catch {
      /* best-effort */
    }
  }

  spawnSync("git", ["-C", gitTop, "worktree", "prune"], {
    encoding: "utf8",
    windowsHide: true,
  });

  print({
    ok: true,
    worktrees,
    deleted,
    remaining: worktrees.length - deleted.length,
  });
}
