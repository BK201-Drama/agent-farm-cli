import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export type WorktreeSnapshotResult = {
  /** 有未纳入上次提交的变更（含「仅被 ignore 的未跟踪文件」） */
  dirty: boolean;
  /** dirty 时 add/commit 是否成功 */
  ok: boolean;
  /** 是否新产生了一条 commit */
  committed: boolean;
  stdoutStderr: string;
};

function gitOut(worktreePath: string, args: string[]): { status: number; out: string } {
  const r = spawnSync("git", ["-C", worktreePath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

/** 被 .gitignore 排除、且未跟踪的路径（标准 status 里看不到） */
function listIgnoredUntracked(worktreePath: string): string {
  const r = spawnSync("git", ["-C", worktreePath, "ls-files", "-o", "-i", "--exclude-standard"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (r.status !== 0) return "";
  return (r.stdout ?? "").trim();
}

/** Vitest/npm 常在 node_modules 下写缓存；不应触发「必须 snapshot」却暂存区为空。 */
function meaningfulIgnoredUntracked(ignoredListStdout: string): string {
  const lines = ignoredListStdout.split(/\r?\n/).filter(Boolean);
  const kept = lines.filter((line) => {
    const n = line.replace(/\\/g, "/");
    const low = n.toLowerCase();
    if (low === "node_modules" || low.startsWith("node_modules/")) return false;
    if (low.includes("/node_modules/")) return false;
    if (low === ".vite" || low.startsWith(".vite/") || low.includes("/.vite/")) return false;
    return true;
  });
  return kept.join("\n");
}

function hasStagedChanges(worktreePath: string): boolean {
  const r = spawnSync("git", ["-C", worktreePath, "diff", "--cached", "--quiet"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 1;
}

function parseForceAddList(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim().length === 0) return [];
  return raw
    .split(/[,;|]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 在任务 worktree 目录内将未提交变更 `git add -A` + 可选强制纳入 ignore 路径 + `git commit`，
 * 便于拆除 worktree 后分支上仍留有可合并记录。
 *
 * - 默认在存在目录时 **`git add -f -- .agent-farm/runs`**，避免产出只写在 ignore 的 runs 里却进不了提交。
 * - 关闭：`AGENT_FARM_WORKTREE_SNAPSHOT_SKIP_RUNS=1`
 * - 其它 ignore 路径：`AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD`（逗号/分号/竖线分隔，相对 worktree 根，逐个 `git add -f`）
 */
export function commitWorktreeSnapshot(worktreePath: string, taskId: string): WorktreeSnapshotResult {
  const st = gitOut(worktreePath, ["status", "--porcelain"]);
  if (st.status !== 0) {
    return {
      dirty: false,
      ok: false,
      committed: false,
      stdoutStderr: st.out,
    };
  }
  const porcelain = st.out.trim();
  const ignoredUntrackedRaw = listIgnoredUntracked(worktreePath);
  const ignoredUntracked = meaningfulIgnoredUntracked(ignoredUntrackedRaw);
  const dirty = Boolean(porcelain.length > 0 || ignoredUntracked.length > 0);
  if (!dirty) {
    return { dirty: false, ok: true, committed: false, stdoutStderr: "" };
  }

  let add = gitOut(worktreePath, ["add", "-A"]);
  if (add.status !== 0) {
    return {
      dirty: true,
      ok: false,
      committed: false,
      stdoutStderr: add.out,
    };
  }

  const skipRuns =
    process.env.AGENT_FARM_WORKTREE_SNAPSHOT_SKIP_RUNS === "1" ||
    process.env.AGENT_FARM_WORKTREE_SNAPSHOT_SKIP_RUNS === "true";
  if (!skipRuns) {
    const runsDir = join(worktreePath, ".agent-farm", "runs");
    if (existsSync(runsDir)) {
      add = gitOut(worktreePath, ["add", "-f", "--", ".agent-farm/runs"]);
      if (add.status !== 0) {
        return {
          dirty: true,
          ok: false,
          committed: false,
          stdoutStderr: add.out,
        };
      }
    }
  }

  for (const p of parseForceAddList(process.env.AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD)) {
    add = gitOut(worktreePath, ["add", "-f", "--", p]);
    if (add.status !== 0) {
      return {
        dirty: true,
        ok: false,
        committed: false,
        stdoutStderr: `git add -f ${p}: ${add.out}`,
      };
    }
  }

  if (!hasStagedChanges(worktreePath)) {
    if (!porcelain && !ignoredUntracked && ignoredUntrackedRaw.length > 0) {
      return { dirty: false, ok: true, committed: false, stdoutStderr: "" };
    }
    const hint =
      "有变更（含仅被 .gitignore 排除的未跟踪文件），但暂存区仍为空。可设置 AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD=路径（逗号分隔）对指定路径执行 git add -f。";
    return {
      dirty: true,
      ok: false,
      committed: false,
      stdoutStderr:
        ignoredUntracked.length > 0 && !porcelain
          ? `${hint}\nignored-untracked (sample):\n${ignoredUntracked.split(/\r?\n/).slice(0, 20).join("\n")}`
          : hint,
    };
  }

  const name = process.env.AGENT_FARM_GIT_COMMITTER_NAME ?? "agent-farm";
  const email = process.env.AGENT_FARM_GIT_COMMITTER_EMAIL ?? "agent-farm@local";
  const verifyHooks = process.env.AGENT_FARM_GIT_COMMIT_VERIFY === "1";
  const commitArgs = ["-C", worktreePath, "-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit"];
  if (!verifyHooks) commitArgs.push("--no-verify");
  commitArgs.push("-m", `agent-farm(task ${taskId}): snapshot before worktree dispose`);

  const commit = spawnSync("git", commitArgs, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  const combined = `${commit.stdout ?? ""}${commit.stderr ?? ""}`.trim();
  if (commit.status !== 0) {
    return { dirty: true, ok: false, committed: false, stdoutStderr: combined };
  }
  return { dirty: true, ok: true, committed: true, stdoutStderr: combined };
}
