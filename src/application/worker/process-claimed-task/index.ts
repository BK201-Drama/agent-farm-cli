import type { JsonMap } from "../../../domain/task.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";
import type { ShellRunner } from "../../../domain/ports/shell-runner.js";
import type { ClaimedTaskCommands } from "../../contracts/claimed-task-commands.js";
import { buildTemplateContextFromTask } from "../command-template.js";
import { collectGitTemplateFields, countWorkingTreeDiffLines } from "../git-context.js";
import {
  resolveAiReviewCommandTemplate,
  shouldSkipAiReviewForSmallDiff,
} from "../ai-review-template.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { taskEvent } from "./events.js";
import { resolveTaskWorkspaceForClaimedTask } from "./worktree.js";
import { runAiReviewStage } from "./stage-ai-review.js";
import { runExecuteStage } from "./stage-execute.js";
import { runVerifyStageIfConfigured } from "./stage-verify.js";
import { buildWorkerChildEnv } from "../task-runtime-env.js";
import { ensureParentDirForDbFile, resolveOpencodeDbPathForTask } from "../opencode-db-path.js";
import { commitWorktreeSnapshot } from "../../../infrastructure/git/commit-worktree-snapshot.js";
import { mergeAgentFarmBranchSerialized } from "../../../infrastructure/git/merge-agent-farm-branch.js";
import { AI_REVIEW_RESULT_SNIPPET_CAP, EXEC_OUTPUT_CAP } from "../worker-output-limits.js";
import { loadAgentFarmProjectConfig } from "../../../infrastructure/config/agent-farm-project-config.js";
import { resolveEmptyRunConfig } from "../empty-run-config.js";

export type ProcessClaimedTaskDeps = {
  task: JsonMap;
  /** 队列/配置用的仓库根（--workspace）；{workspace} 在关闭 worktree 时即此路径 */
  workspaceDir: string;
  runsDir: string;
  commandTemplate: string;
  verifyCommandTemplate: string;
  aiReviewCommandTemplate: string;
  requireAiReview: boolean;
  autoApproveReview: boolean;
  taskCommands: ClaimedTaskCommands;
  eventRepo: EventRepository;
  runShell: ShellRunner;
  clock: IsoClock;
  /** 为每条任务创建独立 git worktree + 分支 agent-farm/<task>，实现多任务真并行改代码 */
  gitWorktreeParallel?: boolean;
  /** 解析 OpenCode `--format json` NDJSON，失败时写入事件并注入 [opencode-heal] 供重试 */
  opencodeJsonEvents?: boolean;
  /** 为每条任务设置独立 OPENCODE_DB（`<workspace>/.agent-farm/opencode-db/<task>.db`），减轻多 worker 并行 OpenCode 的 SQLite 争用 */
  isolateOpencodeDb?: boolean;
  /** 任务标记 done 后，在仓库根将 `agent-farm/<id>` 合并进当前检出分支（需 git worktree 模式且工作区干净） */
  autoMergeWorktree?: boolean;
};

export async function processClaimedTask(deps: ProcessClaimedTaskDeps): Promise<void> {
  const { task, workspaceDir: mainWorkspace, runsDir, taskCommands, eventRepo, clock } = deps;
  const taskId = String(task.task_id ?? "");
  const taskAttempt = Number(task.attempt ?? 0);
  const heartbeat = async () => {
    await taskCommands.touchHeartbeat(taskId);
  };

  if (await taskCommands.hasActiveDuplicateDedupeForTask(task)) {
    await taskCommands.updateStatus(taskId, "blocked", {
      blocked_reason: `duplicate dedupe_key: ${String(task.dedupe_key ?? "")}`,
    });
    await eventRepo.append(
      taskEvent({
        ts: clock(),
        event: "task_deduped_blocked",
        task_id: taskId,
        dedupe_key: String(task.dedupe_key ?? ""),
      })
    );
    return;
  }

  const workspace = await resolveTaskWorkspaceForClaimedTask({
    gitWorktreeParallel: Boolean(deps.gitWorktreeParallel),
    mainWorkspace,
    taskId,
    task,
    taskCommands,
    eventRepo,
    clock,
  });
  if (workspace === null) return;

  const { rootForNode, taskWorkspace, worktreeBranch, disposeWorktree } = workspace;

  const gitFields = await collectGitTemplateFields(taskWorkspace);
  const tplCtx = () => ({
    ...buildTemplateContextFromTask(task, runsDir, taskWorkspace),
    git_diff: gitFields.git_diff,
    git_diff_name_status: gitFields.git_diff_name_status,
  });
  let opencodeDbPath: string | undefined;
  if (deps.isolateOpencodeDb) {
    opencodeDbPath = resolveOpencodeDbPathForTask(mainWorkspace, taskId);
    ensureParentDirForDbFile(opencodeDbPath);
  }
  const env = buildWorkerChildEnv(
    task,
    runsDir,
    taskWorkspace,
    rootForNode,
    worktreeBranch,
    opencodeDbPath,
  );

  const projectConfig = loadAgentFarmProjectConfig(mainWorkspace);
  const emptyRunConfig = resolveEmptyRunConfig(projectConfig, task);

  const shellCtx: ClaimedTaskShellContext = {
    task,
    taskId,
    taskAttempt,
    runsDir,
    taskWorkspace,
    emptyRunConfig,
    tplCtx,
    env,
    heartbeat,
    runShell: deps.runShell,
    opencodeJsonEvents: Boolean(deps.opencodeJsonEvents),
    taskCommands,
    eventRepo,
    clock,
  };

  await taskCommands.updateStatus(taskId, "running");
  await eventRepo.append(taskEvent({ ts: clock(), event: "task_running", task_id: taskId }));

  const useAgentFarmWorktree =
    Boolean(deps.gitWorktreeParallel) &&
    Boolean(disposeWorktree) &&
    Boolean(worktreeBranch) &&
    taskWorkspace !== mainWorkspace;

  let eligibleForAutoMerge = false;

  const executeTemplate =
    String(task.execute_command_template ?? "").trim() || deps.commandTemplate;
  const verifyTemplate =
    String(task.verify_command_template ?? "").trim() || deps.verifyCommandTemplate;

  try {
    const execResult = await runExecuteStage(shellCtx, executeTemplate);
    if (!execResult.ok) return;

    const verifyResult = await runVerifyStageIfConfigured(shellCtx, verifyTemplate);
    if (!verifyResult.ok) return;

    const diffLines = countWorkingTreeDiffLines(taskWorkspace);
    const skipSmallDiffAi = shouldSkipAiReviewForSmallDiff(
      task,
      deps.aiReviewCommandTemplate,
      Boolean(deps.requireAiReview),
      diffLines,
    );
    if (skipSmallDiffAi && resolveAiReviewCommandTemplate(task, deps.aiReviewCommandTemplate)) {
      await eventRepo.append(
        taskEvent({
          ts: clock(),
          event: "task_ai_review_skipped",
          task_id: taskId,
          meta: { reason: "small_diff", diff_lines: diffLines },
        }),
      );
    }
    const aiResult = await runAiReviewStage(shellCtx, {
      aiReviewCommandTemplate: skipSmallDiffAi ? "" : deps.aiReviewCommandTemplate,
      requireAiReview: deps.requireAiReview,
    });
    if (aiResult.kind === "blocked" || aiResult.kind === "fail") return;

    const execOut = execResult.output;
    const aiReviewOutput = aiResult.output;

    const reviewExtra: JsonMap = {
      result: { exit_code: 0, output: execOut.slice(0, EXEC_OUTPUT_CAP) },
    };
    if (aiReviewOutput !== undefined) {
      (reviewExtra.result as JsonMap).ai_review_output = aiReviewOutput.slice(0, AI_REVIEW_RESULT_SNIPPET_CAP);
    }
    await taskCommands.updateStatus(taskId, "review", reviewExtra);
    await eventRepo.append(taskEvent({ ts: clock(), event: "task_review", task_id: taskId }));
    if (deps.autoApproveReview) {
      await taskCommands.updateStatus(taskId, "approved");
      await taskCommands.updateStatus(taskId, "done");
      await eventRepo.append(taskEvent({ ts: clock(), event: "task_done", task_id: taskId }));
      eligibleForAutoMerge = true;
    }
  } finally {
    let snapshotBlockedDispose = false;
    const snapshotDisabled =
      process.env.AGENT_FARM_WORKTREE_SNAPSHOT === "0" ||
      process.env.AGENT_FARM_WORKTREE_SNAPSHOT === "false";

    if (useAgentFarmWorktree && !snapshotDisabled) {
      const snap = commitWorktreeSnapshot(taskWorkspace, taskId);
      if (snap.dirty && !snap.ok) {
        snapshotBlockedDispose = true;
        const snippet = snap.stdoutStderr.slice(0, EXEC_OUTPUT_CAP);
        console.error(`[agent-farm] worktree snapshot commit failed (task ${taskId}): ${snippet}`);
        await eventRepo.append(
          taskEvent({
            ts: clock(),
            event: "task_worktree_snapshot_failed",
            task_id: taskId,
            branch: worktreeBranch,
            snapshot_output: snippet,
          }),
        );
      } else if (snap.dirty && snap.committed) {
        await eventRepo.append(
          taskEvent({
            ts: clock(),
            event: "task_worktree_snapshot_committed",
            task_id: taskId,
            branch: worktreeBranch,
          }),
        );
      }
    }

    if (!snapshotBlockedDispose) {
      if (eligibleForAutoMerge && deps.autoMergeWorktree && worktreeBranch) {
        const mergeResult = await mergeAgentFarmBranchSerialized(
          rootForNode,
          worktreeBranch,
          taskId,
          clock(),
        );
        if (!mergeResult.ok) {
          const snippet = mergeResult.combined.slice(0, EXEC_OUTPUT_CAP);
          console.error(`[agent-farm] git merge failed (${worktreeBranch}, reason=${mergeResult.reason}): ${snippet}`);
          console.error(
            `[agent-farm] hint: 在仓库根解决冲突或脏工作区后重试；查看事件 task_merge_failed；执行 agent-farm doctor 与 agent-farm queue list（README「自动合并」）`,
          );
          console.error("[agent-farm] 排查：参见 README #自动合并进当前分支（AGENT_FARM_AUTO_MERGE=0 可关闭自动合并）");
          await eventRepo.append(
            taskEvent({
              ts: clock(),
              event: "task_merge_failed",
              task_id: taskId,
              branch: worktreeBranch,
              merge_output: snippet,
              reason: mergeResult.reason,
            }),
          );
        } else {
          await eventRepo.append(
            taskEvent({
              ts: clock(),
              event: "task_merged",
              task_id: taskId,
              branch: worktreeBranch,
            }),
          );
        }
      }
      disposeWorktree?.();
    }
  }
}
