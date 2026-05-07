import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** 供 worktree 目录名使用，避免非法路径字符 */
export function sanitizeTaskIdForPath(taskId: string): string {
  const s = taskId.replace(/[/\\:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 120);
  return s.length > 0 ? s : "task";
}

export function resolveGitTopLevel(cwd: string): string | null {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  const line = r.stdout.trim().split(/\r?\n/)[0]?.trim();
  return line && line.length > 0 ? line : null;
}

export type AgentFarmWorktree = {
  /** 任务独占检出目录 */
  path: string;
  /** 专用分支名，便于 merge；移除 worktree 后分支仍在 */
  branch: string;
  /** 任务结束后移除 worktree 目录（分支保留） */
  dispose: () => void;
};

/**
 * 在 <git-toplevel>/.agent-farm/worktrees/<id> 下添加 worktree，并创建分支 `agent-farm/<id>`（起点为当前 HEAD）。
 * 工作区为干净树（不含主工作区未提交改动）；任务结束后可移除目录，分支仍保留便于 merge / 检视。
 */
export function createAgentFarmWorktree(mainWorkspace: string, taskId: string): AgentFarmWorktree {
  const top = resolveGitTopLevel(mainWorkspace);
  if (!top) {
    throw new Error(
      "[agent-farm] --git-worktree-parallel requires a git repository (git rev-parse --show-toplevel failed)"
    );
  }
  const base = join(top, ".agent-farm", "worktrees");
  mkdirSync(base, { recursive: true });
  const safeId = sanitizeTaskIdForPath(taskId);
  const dir = join(base, safeId);
  const branch = `agent-farm/${safeId}`;

  if (existsSync(dir)) {
    spawnSync("git", ["-C", top, "worktree", "remove", "--force", dir], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }
  spawnSync("git", ["-C", top, "branch", "-D", branch], { encoding: "utf8", windowsHide: true });

  const add = spawnSync("git", ["-C", top, "worktree", "add", "-b", branch, dir, "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (add.status !== 0) {
    const msg = (add.stderr || add.stdout || "").trim() || "unknown error";
    throw new Error(`[agent-farm] git worktree add failed: ${msg}`);
  }

  const dispose = (): void => {
    spawnSync("git", ["-C", top, "worktree", "remove", "--force", dir], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    spawnSync("git", ["-C", top, "worktree", "prune"], { encoding: "utf8", windowsHide: true });
  };

  return { path: dir, branch, dispose };
}
