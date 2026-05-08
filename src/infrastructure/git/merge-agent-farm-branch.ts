import { spawnSync } from "node:child_process";

/** 多 worker 并行完成时串行执行 merge，避免同时改同一 refs。 */
let mergeTail: Promise<void> = Promise.resolve();

function mergeOutput(r: ReturnType<typeof spawnSync>): string {
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
}

/** `git merge` 因主工作区有未提交改动而拒绝（非冲突）。 */
function mergeBlockedByDirtyWorkingTree(output: string): boolean {
  const s = output.toLowerCase();
  return (
    (s.includes("local changes") && s.includes("overwritten")) ||
    s.includes("please commit your changes or stash them") ||
    s.includes("your local changes to the following files")
  );
}

/**
 * 在 git 仓库根将本地分支 `branch` 合并进**当前检出分支**（--no-ff）。
 * 若因**未提交改动**被拒：默认先 **`git stash push -u`**，合并后再 **`git stash pop`** 恢复现场。
 * 关闭：`AGENT_FARM_AUTO_MERGE_STASH=0` / `false`。
 */
export function mergeAgentFarmBranchSerialized(
  gitTop: string,
  branch: string,
  taskId: string,
): Promise<{ ok: boolean; combined: string }> {
  const msg = `agent-farm: merge task ${taskId} (${branch})`;
  const allowStash =
    process.env.AGENT_FARM_AUTO_MERGE_STASH !== "0" &&
    process.env.AGENT_FARM_AUTO_MERGE_STASH !== "false";

  const run = (): { ok: boolean; combined: string } => {
    const tryMerge = (): ReturnType<typeof spawnSync> =>
      spawnSync("git", ["-C", gitTop, "merge", "--no-ff", "-m", msg, branch], {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });

    let r = tryMerge();
    let combined = mergeOutput(r);
    if (r.status === 0) {
      return { ok: true, combined };
    }

    if (allowStash && mergeBlockedByDirtyWorkingTree(combined)) {
      const stashMsg = `agent-farm: pre-merge ${taskId} (${branch})`;
      const stash = spawnSync("git", ["-C", gitTop, "stash", "push", "-u", "-m", stashMsg], {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      const stashOut = mergeOutput(stash);
      if (stash.status !== 0) {
        return {
          ok: false,
          combined: `${combined}\n---\ngit stash push failed:\n${stashOut}`.trim(),
        };
      }

      r = tryMerge();
      combined = mergeOutput(r);
      if (r.status !== 0) {
        const popUndo = spawnSync("git", ["-C", gitTop, "stash", "pop"], {
          encoding: "utf8",
          windowsHide: true,
          maxBuffer: 2 * 1024 * 1024,
        });
        const undoOut = mergeOutput(popUndo);
        return {
          ok: false,
          combined:
            `${combined}\n---\nmerge failed after stash; attempted stash pop to restore:\n${undoOut}`.trim(),
        };
      }

      const pop = spawnSync("git", ["-C", gitTop, "stash", "pop"], {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      const popOut = mergeOutput(pop);
      if (pop.status !== 0) {
        return {
          ok: false,
          combined:
            `${combined}\n---\nmerge succeeded but git stash pop failed (resolve conflicts then drop stash if needed):\n${popOut}`.trim(),
        };
      }
      return {
        ok: true,
        combined: `${combined}\n---\n(stashed local changes restored via stash pop)`.trim(),
      };
    }

    return { ok: false, combined };
  };

  const job = mergeTail.then(run);
  mergeTail = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
