import type { JsonMap } from "../../../domain/task.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";
import type { ShellRunner } from "../../../domain/ports/shell-runner.js";
import type { ClaimedTaskCommands } from "../../contracts/claimed-task-commands.js";
import { buildTemplateContextFromTask } from "../command-template.js";
import { collectGitTemplateFields, countWorkingTreeDiffLines } from "../git-context.js";
import { resolveAiReviewCommandTemplate, shouldSkipAiReviewForSmallDiff } from "../ai-review-template.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { taskEvent, appendTaskFailedRetry } from "./events.js";
import { runAcceptanceCheck } from "../acceptance-check.js";
import { basePromptForRetry } from "../opencode-retry-diag.js";
import { resolveTaskWorkspaceForClaimedTask } from "./worktree.js";
import { runAiReviewStage } from "./stage-ai-review.js";
import { runExecuteStage } from "./stage-execute.js";
import { runVerifyStageIfConfigured } from "./stage-verify.js";
import { runAwaitingDecisionStage } from "./stage-awaiting-decision.js";
import { buildWorkerChildEnv } from "../task-runtime-env.js";
import { ensureParentDirForDbFile, resolveOpencodeDbPathForTask, resolveClaudeConfigDirForTask } from "../opencode-db-path.js";
import type { GitWorkspacePort } from "../../contracts/git-workspace.js";
import type { ProjectConfigPort } from "../../contracts/agent-farm-project-config.js";
import type { ExecutionMemoryRepository } from "../../../domain/ports/repositories.js";
import type { AgentStreamObserver } from "../../../domain/ports/agent-stream-observer.js";
import { AI_REVIEW_RESULT_SNIPPET_CAP, EXEC_OUTPUT_CAP } from "../worker-output-limits.js";
import { resolveEmptyRunConfig } from "../empty-run-config.js";
import { enrichTaskWithTypeRoute } from "../task-type-enrich.js";
import type { WebhookDispatcher } from "../../webhook/webhook-dispatcher.js";
import { recordExecutionMemory } from "../execution-memory-recorder.js";

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
  /** 解析 Claude Code `--output-format stream-json` NDJSON，失败时写入事件并注入 [claude-heal] 供重试 */
  claudeCodeJsonEvents?: boolean;
  /** 为每条任务设置独立 OPENCODE_DB（`<workspace>/.agent-farm/opencode-db/<task>.db`），减轻多 worker 并行 OpenCode 的 SQLite 争用 */
  isolateOpencodeDb?: boolean;
  /** 为每条任务设置独立 CLAUDE_CONFIG_DIR，减轻多 worker 并行 Claude Code 的状态争用 */
  isolateClaudeDb?: boolean;
  /** 任务标记 done 后，在仓库根将 `agent-farm/<id>` 合并进当前检出分支（需 git worktree 模式且工作区干净） */
  autoMergeWorktree?: boolean;
  /** 启用决策仲裁门禁 */
  decisionEngineEnabled?: boolean;
  projectConfig: ProjectConfigPort;
  gitWorkspace: GitWorkspacePort;
  webhookDispatcher?: WebhookDispatcher | null;
  executionMemoryRepo?: ExecutionMemoryRepository | null;
};

export async function processClaimedTask(deps: ProcessClaimedTaskDeps): Promise<void> {
  const { task, workspaceDir: mainWorkspace, runsDir, taskCommands, eventRepo, clock } = deps;
  const taskId = String(task.task_id ?? "");
  const taskAttempt = Number(task.attempt ?? 0);
  const startedAt = Date.now();

  const recordMem = async (exitCode: number, terminalStatus: string, taskWorkspace: string, streamObs?: AgentStreamObserver | null) => {
    if (!deps.executionMemoryRepo) return;
    const durationMs = Date.now() - startedAt;
    await recordExecutionMemory({
      task,
      taskWorkspace,
      exitCode,
      durationMs,
      terminalStatus,
      projectConfig: deps.projectConfig.load(mainWorkspace),
      executionMemoryRepo: deps.executionMemoryRepo,
      streamObs,
    });
  };
  const heartbeat = async () => {
    await taskCommands.touchHeartbeat(taskId);
  };
  const notifyWebhook = (event: "task_done" | "task_failed" | "task_retry" | "task_blocked" | "task_review") => {
    if (!deps.webhookDispatcher) return;
    void deps.webhookDispatcher.notify(event, task, clock()).catch((err) => {
      console.error(`[agent-farm] webhook notify failed for task ${taskId}:`, err instanceof Error ? err.message : String(err));
    });
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
      }),
    );
    notifyWebhook("task_blocked");
    await recordMem(-1, "blocked", mainWorkspace);
    return;
  }

  const workspace = await resolveTaskWorkspaceForClaimedTask({
    git: deps.gitWorkspace,
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
  let claudeConfigDir: string | undefined;
  if (deps.isolateClaudeDb) {
    claudeConfigDir = resolveClaudeConfigDirForTask(mainWorkspace, taskId);
    ensureParentDirForDbFile(claudeConfigDir);
  }
  const env = buildWorkerChildEnv(task, runsDir, taskWorkspace, rootForNode, worktreeBranch, opencodeDbPath, claudeConfigDir);

  const projectConfig = deps.projectConfig.load(mainWorkspace);
  const emptyRunConfig = resolveEmptyRunConfig(projectConfig, task);

  const shellCtx: ClaimedTaskShellContext = {
    task,
    taskId,
    taskAttempt,
    runsDir,
    taskWorkspace,
    emptyRunConfig,
    projectConfig,
    tplCtx,
    env,
    heartbeat,
    runShell: deps.runShell,
    opencodeJsonEvents: Boolean(deps.opencodeJsonEvents),
    claudeJsonEvents: Boolean(deps.claudeCodeJsonEvents),
    taskCommands,
    eventRepo,
    clock,
  };

  // M4+ 根据 task_type 增强 prompt 和 verify 策略
  enrichTaskWithTypeRoute(task, projectConfig);

  await taskCommands.updateStatus(taskId, "running");
  await eventRepo.append(taskEvent({ ts: clock(), event: "task_running", task_id: taskId }));

  const useAgentFarmWorktree =
    Boolean(deps.gitWorktreeParallel) &&
    Boolean(disposeWorktree) &&
    Boolean(worktreeBranch) &&
    taskWorkspace !== mainWorkspace;

  let eligibleForAutoMerge = false;

  const executeTemplate = String(task.execute_command_template ?? "").trim() || deps.commandTemplate;
  const verifyTemplate = String(task.verify_command_template ?? "").trim() || deps.verifyCommandTemplate;

  try {
    const execResult = await runExecuteStage(shellCtx, executeTemplate);
    if (!execResult.ok) return;
    const executeStreamObs = execResult.streamObs;

    const verifyResult = await runVerifyStageIfConfigured(shellCtx, verifyTemplate);
    if (!verifyResult.ok) return;

    // Decision gate: check if MCP bridge transitioned task to awaiting_decision
    const decisionResult = await runAwaitingDecisionStage(shellCtx, {
      decisionEngineEnabled: Boolean(deps.decisionEngineEnabled),
    });
    if (decisionResult.kind === "awaiting_decision") {
      // Worker releases; task will be retried when decision is resolved
      return;
    }
    if (decisionResult.kind === "fail") {
      await taskCommands.updateStatus(taskId, "failed", {
        last_error: `decision gate: ${decisionResult.reason}`,
      });
      notifyWebhook("task_failed");
      await recordMem(1, "failed", taskWorkspace, executeStreamObs);
      return;
    }

    const acceptanceCmd = String(task.acceptance_criteria ?? "").trim();
    if (acceptanceCmd) {
      const accResult = await runAcceptanceCheck(acceptanceCmd, {
        cwd: shellCtx.taskWorkspace,
        env: shellCtx.env,
        runShell: shellCtx.runShell,
      });
      if (!accResult.passed) {
        const attemptPlus1 = shellCtx.taskAttempt + 1;
        const basePrompt = basePromptForRetry(String(task.prompt ?? ""));
        await taskCommands.updateStatus(taskId, "retry", {
          attempt: attemptPlus1,
          last_error: `acceptance check failed\n${accResult.output.slice(0, EXEC_OUTPUT_CAP)}`,
          prompt: `${basePrompt}\n\n[verify-fail]\n${accResult.output.slice(0, EXEC_OUTPUT_CAP)}`,
        });
        await appendTaskFailedRetry(eventRepo, clock, taskId, attemptPlus1, "verify");
        notifyWebhook("task_retry");
        return;
      }
      const reviewExtra: JsonMap = {
        result: { exit_code: 0, output: execResult.output.slice(0, EXEC_OUTPUT_CAP) },
      };
      await taskCommands.updateStatus(taskId, "review", reviewExtra);
      await eventRepo.append(taskEvent({ ts: clock(), event: "task_review", task_id: taskId }));
      await taskCommands.updateStatus(taskId, "approved");
      await taskCommands.updateStatus(taskId, "done");
      await eventRepo.append(taskEvent({ ts: clock(), event: "task_done", task_id: taskId }));
      eligibleForAutoMerge = true;
      notifyWebhook("task_done");
      await recordMem(0, "done", taskWorkspace, executeStreamObs);
    } else {
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
      if (aiResult.kind === "blocked" || aiResult.kind === "fail") {
        notifyWebhook(aiResult.kind === "blocked" ? "task_blocked" : "task_failed");
        await recordMem(aiResult.kind === "blocked" ? -1 : 1, aiResult.kind === "blocked" ? "blocked" : "failed", taskWorkspace, executeStreamObs);
        return;
      }

      const execOut = execResult.output;
      const aiReviewOutput = aiResult.output;

      const execResultData: Record<string, unknown> = { exit_code: 0, output: execOut.slice(0, EXEC_OUTPUT_CAP) };
      if (aiReviewOutput !== undefined) {
        execResultData.ai_review_output = aiReviewOutput.slice(0, AI_REVIEW_RESULT_SNIPPET_CAP);
      }
      const reviewExtra: JsonMap = {
        result: execResultData,
      };
      await taskCommands.updateStatus(taskId, "review", reviewExtra);
      await eventRepo.append(taskEvent({ ts: clock(), event: "task_review", task_id: taskId }));
      if (deps.autoApproveReview) {
        await taskCommands.updateStatus(taskId, "approved");
        await taskCommands.updateStatus(taskId, "done");
        await eventRepo.append(taskEvent({ ts: clock(), event: "task_done", task_id: taskId }));
        eligibleForAutoMerge = true;
        notifyWebhook("task_done");
        await recordMem(0, "done", taskWorkspace, executeStreamObs);
      }
    }
  } finally {
    let snapshotBlockedDispose = false;
    const snapshotDisabled =
      process.env.AGENT_FARM_WORKTREE_SNAPSHOT === "0" || process.env.AGENT_FARM_WORKTREE_SNAPSHOT === "false";

    if (useAgentFarmWorktree && !snapshotDisabled) {
      try {
        const snap = deps.gitWorkspace.commitWorktreeSnapshot(taskWorkspace, taskId);
        if (snap.dirty && !snap.ok) {
          snapshotBlockedDispose = true;
          const snippet = snap.stdoutStderr.slice(0, EXEC_OUTPUT_CAP);
          console.error(`[agent-farm] worktree snapshot commit failed (task ${taskId}): ${snippet}`);
          try {
            await eventRepo.append(
              taskEvent({
                ts: clock(),
                event: "task_worktree_snapshot_failed",
                task_id: taskId,
                branch: worktreeBranch,
                snapshot_output: snippet,
              }),
            );
          } catch (logErr) {
            console.error(`[agent-farm] failed to log snapshot_failed event: ${String(logErr)}`);
          }
        } else if (snap.dirty && snap.committed) {
          try {
            await eventRepo.append(
              taskEvent({
                ts: clock(),
                event: "task_worktree_snapshot_committed",
                task_id: taskId,
                branch: worktreeBranch,
              }),
            );
          } catch (logErr) {
            console.error(`[agent-farm] failed to log snapshot_committed event: ${String(logErr)}`);
          }
        }
      } catch (snapErr) {
        console.error(`[agent-farm] worktree snapshot error (task ${taskId}): ${String(snapErr)}`);
      }
    }

    try {
      if (!snapshotBlockedDispose) {
        if (eligibleForAutoMerge && deps.autoMergeWorktree && worktreeBranch) {
          const mergeResult = await deps.gitWorkspace.mergeAgentFarmBranchSerialized(
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
            try {
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
            } catch (logErr) {
              console.error(`[agent-farm] failed to log merge_failed event: ${String(logErr)}`);
            }
          } else {
            try {
              await eventRepo.append(
                taskEvent({
                  ts: clock(),
                  event: "task_merged",
                  task_id: taskId,
                  branch: worktreeBranch,
                }),
              );
            } catch (logErr) {
              console.error(`[agent-farm] failed to log merged event: ${String(logErr)}`);
            }
          }
        }
      }
    } catch (mergeErr) {
      console.error(`[agent-farm] merge error (task ${taskId}): ${String(mergeErr)}`);
    } finally {
      if (!snapshotBlockedDispose) {
        disposeWorktree?.();
      }
    }
  }
}
