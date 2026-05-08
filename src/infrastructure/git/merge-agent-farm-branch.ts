import { spawnSync } from "node:child_process";

/** 多 worker 并行完成时串行执行 merge，避免同时改同一 refs。 */
let mergeTail: Promise<void> = Promise.resolve();

/**
 * 在 git 仓库根将本地分支 `branch` 合并进**当前检出分支**（--no-ff）。
 * 成功完成任务后调用；冲突或非干净工作区时返回 ok: false，由调用方记录事件。
 *
 * @param gitTop - git 仓库根目录路径
 * @param branch - 要合并的本地分支名
 * @param taskId - 关联的任务 ID，用于提交消息
 * @returns Promise resolves to {@link ok} 是否成功，以及 {@link combined} 合并输出的 stdout/stderr 拼接
 */
export function mergeAgentFarmBranchSerialized(
  gitTop: string,
  branch: string,
  taskId: string,
): Promise<{ ok: boolean; combined: string }> {
  const msg = `agent-farm: merge task ${taskId} (${branch})`;
  const run = (): { ok: boolean; combined: string } => {
    const r = spawnSync("git", ["-C", gitTop, "merge", "--no-ff", "-m", msg, branch], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    return { ok: r.status === 0, combined };
  };

  const job = mergeTail.then(run);
  mergeTail = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
