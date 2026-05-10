import { spawnSync } from "node:child_process";

export type MergeFailureReason =
  | "stash_push_failed"
  | "merge_failed_after_stash"
  | "stash_pop_failed"
  | "merge_failed"
  | "detached_base_branch"
  | "checkout_failed"
  | "rebase_failed"
  | "ff_merge_failed";

export type MergeResult = { ok: true; combined: string } | { ok: false; combined: string; reason: MergeFailureReason };

type QueueEntry = {
  gitTop: string;
  branch: string;
  taskId: string;
  completedAtIso: string;
  resolve: (r: MergeResult) => void;
};

const inbox: QueueEntry[] = [];

/** 多 worker 并行完成时串行执行合并，避免同时改同一 refs。 */
let mergeTail: Promise<void> = Promise.resolve();

function compareQueueEntries(a: QueueEntry, b: QueueEntry): number {
  const byTop = a.gitTop.localeCompare(b.gitTop);
  if (byTop !== 0) {
    return byTop;
  }
  const byTime = a.completedAtIso.localeCompare(b.completedAtIso);
  if (byTime !== 0) {
    return byTime;
  }
  return a.taskId.localeCompare(b.taskId);
}

function mergeOutput(r: ReturnType<typeof spawnSync>): string {
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
}

function gitSpawn(gitTop: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("git", ["-C", gitTop, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
}

/**
 * 检测 `git merge` 是否因主工作区有未提交改动而拒绝（非冲突）。
 *
 * 启发式实现，依赖 git 英文输出中的特定关键词。
 * 局限：
 * - 仅匹配英文信息，其他语言环境下可能失效。
 * - 随着 git 版本更新，输出措辞可能变化，需持续关注。
 */
function mergeBlockedByDirtyWorkingTree(output: string): boolean {
  const s = output.toLowerCase();
  return (
    (s.includes("local changes") && s.includes("overwritten")) ||
    s.includes("please commit your changes or stash them") ||
    s.includes("please commit or stash them") ||
    s.includes("your local changes to the following files") ||
    (s.includes("cannot rebase") && s.includes("unstaged changes"))
  );
}

function integrationStrategy(): "merge" | "rebase" {
  const raw = (process.env.AGENT_FARM_AUTO_MERGE_STRATEGY ?? "").trim().toLowerCase();
  return raw === "rebase" ? "rebase" : "merge";
}

function currentBranchName(gitTop: string): string | undefined {
  const r = gitSpawn(gitTop, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (r.status !== 0) {
    return undefined;
  }
  const name = mergeOutput(r).trim();
  if (!name || name === "HEAD") {
    return undefined;
  }
  return name;
}

function runMergeNoFf(gitTop: string, branch: string, taskId: string): MergeResult {
  const msg = `agent-farm: merge task ${taskId} (${branch})`;
  const tryMerge = (): ReturnType<typeof spawnSync> =>
    gitSpawn(gitTop, ["merge", "--no-ff", "-m", msg, branch]);

  let r = tryMerge();
  let combined = mergeOutput(r);
  if (r.status === 0) {
    return { ok: true, combined };
  }

  const allowStash =
    process.env.AGENT_FARM_AUTO_MERGE_STASH !== "0" &&
    process.env.AGENT_FARM_AUTO_MERGE_STASH !== "false";

  if (allowStash && mergeBlockedByDirtyWorkingTree(combined)) {
    const stashMsg = `agent-farm: pre-merge ${taskId} (${branch})`;
    const stash = gitSpawn(gitTop, ["stash", "push", "-u", "-m", stashMsg]);
    const stashOut = mergeOutput(stash);
    if (stash.status !== 0) {
      return {
        ok: false,
        reason: "stash_push_failed",
        combined: `${combined}\n---\ngit stash push failed:\n${stashOut}`.trim(),
      };
    }

    r = tryMerge();
    combined = mergeOutput(r);
    if (r.status !== 0) {
      const popUndo = gitSpawn(gitTop, ["stash", "pop"]);
      const undoOut = mergeOutput(popUndo);
      return {
        ok: false,
        reason: "merge_failed_after_stash",
        combined:
          `${combined}\n---\nmerge failed after stash; attempted stash pop to restore:\n${undoOut}`.trim(),
      };
    }

    const pop = gitSpawn(gitTop, ["stash", "pop"]);
    const popOut = mergeOutput(pop);
    if (pop.status !== 0) {
      return {
        ok: false,
        reason: "stash_pop_failed",
        combined:
          `${combined}\n---\nmerge succeeded but git stash pop failed (resolve conflicts then drop stash if needed):\n${popOut}`.trim(),
      };
    }
    return {
      ok: true,
      combined: `${combined}\n---\n(stashed local changes restored via stash pop)`.trim(),
    };
  }

  return { ok: false, reason: "merge_failed", combined };
}

/**
 * 在检出分支上将 `branch` rebase 到当前基线，再切回基线并 `merge --ff-only`，得到线性历史。
 * 脏树行为与 merge 策略一致：默认先 stash，结束后再 pop。
 */
function runRebaseThenFf(gitTop: string, branch: string, taskId: string): MergeResult {
  const allowStash =
    process.env.AGENT_FARM_AUTO_MERGE_STASH !== "0" &&
    process.env.AGENT_FARM_AUTO_MERGE_STASH !== "false";

  const tryIntegrate = (): MergeResult => {
    const baseRef = currentBranchName(gitTop);
    if (!baseRef) {
      return {
        ok: false,
        reason: "detached_base_branch",
        combined:
          "agent-farm: cannot auto-merge with rebase strategy while HEAD is detached (need a named branch)",
      };
    }

    let r = gitSpawn(gitTop, ["checkout", branch]);
    let combined = mergeOutput(r);
    if (r.status !== 0) {
      return { ok: false, reason: "checkout_failed", combined };
    }

    r = gitSpawn(gitTop, ["rebase", baseRef]);
    combined = `${combined}\n${mergeOutput(r)}`.trim();
    if (r.status !== 0) {
      gitSpawn(gitTop, ["rebase", "--abort"]);
      gitSpawn(gitTop, ["checkout", baseRef]);
      return { ok: false, reason: "rebase_failed", combined };
    }

    r = gitSpawn(gitTop, ["checkout", baseRef]);
    combined = `${combined}\n${mergeOutput(r)}`.trim();
    if (r.status !== 0) {
      return { ok: false, reason: "checkout_failed", combined };
    }

    r = gitSpawn(gitTop, ["merge", "--ff-only", branch]);
    combined = `${combined}\n${mergeOutput(r)}`.trim();
    if (r.status !== 0) {
      return { ok: false, reason: "ff_merge_failed", combined };
    }

    return { ok: true, combined };
  };

  let r = tryIntegrate();
  if (r.ok) {
    return r;
  }

  if (!allowStash || !mergeBlockedByDirtyWorkingTree(r.combined)) {
    return r;
  }

  const stashMsg = `agent-farm: pre-rebase-merge ${taskId} (${branch})`;
  const stash = gitSpawn(gitTop, ["stash", "push", "-u", "-m", stashMsg]);
  const stashOut = mergeOutput(stash);
  if (stash.status !== 0) {
    return {
      ok: false,
      reason: "stash_push_failed",
      combined: `${r.combined}\n---\ngit stash push failed:\n${stashOut}`.trim(),
    };
  }

  r = tryIntegrate();
  if (!r.ok) {
    const popUndo = gitSpawn(gitTop, ["stash", "pop"]);
    const undoOut = mergeOutput(popUndo);
    return {
      ok: false,
      reason: "merge_failed_after_stash",
      combined:
        `${r.combined}\n---\nintegrate failed after stash; attempted stash pop to restore:\n${undoOut}`.trim(),
    };
  }

  const pop = gitSpawn(gitTop, ["stash", "pop"]);
  const popOut = mergeOutput(pop);
  if (pop.status !== 0) {
    return {
      ok: false,
      reason: "stash_pop_failed",
      combined:
        `${r.combined}\n---\nintegrate succeeded but git stash pop failed (resolve conflicts then drop stash if needed):\n${popOut}`.trim(),
    };
  }

  return {
    ok: true,
    combined: `${r.combined}\n---\n(stashed local changes restored via stash pop)`.trim(),
  };
}

function runOne(entry: Omit<QueueEntry, "resolve">): MergeResult {
  const { gitTop, branch, taskId } = entry;
  return integrationStrategy() === "rebase"
    ? runRebaseThenFf(gitTop, branch, taskId)
    : runMergeNoFf(gitTop, branch, taskId);
}

function drainQueue(): void {
  inbox.sort(compareQueueEntries);
  while (inbox.length > 0) {
    const e = inbox.shift()!;
    e.resolve(runOne(e));
  }
}

/**
 * 在 git 仓库根将本地分支 `branch` 合进**当前检出分支**。
 *
 * - **默认**（`AGENT_FARM_AUTO_MERGE_STRATEGY` 未设或非 `rebase`）：`git merge --no-ff`。
 * - **`AGENT_FARM_AUTO_MERGE_STRATEGY=rebase`**：在任务分支上 `git rebase <当前分支>`，再切回并 `git merge --ff-only`，历史为线性。
 * - 若因**未提交改动**被拒：默认先 **`git stash push -u`**，成功后再 **`git stash pop`**。关闭：`AGENT_FARM_AUTO_MERGE_STASH=0` / `false`。
 *
 * 多 worker 同时完成时，同一 `gitTop` 下按 `completedAtIso`（完成时间）升序再执行，避免「谁先回调谁先合」的乱序。
 *
 * @param gitTop 仓库根路径
 * @param branch 要并入的本地分支名（如 `agent-farm/<task>`）
 * @param taskId 任务 id（写入 merge commit message）
 * @param completedAtIso 可选；任务完成时刻的 ISO 时间，用于合并排序；缺省为调用时的 `new Date().toISOString()`
 */
export function mergeAgentFarmBranchSerialized(
  gitTop: string,
  branch: string,
  taskId: string,
  completedAtIso?: string,
): Promise<MergeResult> {
  const iso = (completedAtIso ?? "").trim() || new Date().toISOString();
  return new Promise<MergeResult>((resolve) => {
    inbox.push({ gitTop, branch, taskId, completedAtIso: iso, resolve });
    mergeTail = mergeTail.then(() => {
      drainQueue();
    });
  });
}
