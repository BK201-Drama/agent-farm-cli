import type { EventRecord } from "../../domain/event.js";
import type { JsonMap } from "../../domain/task.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { ClaimedTaskCommands } from "../contracts/claimed-task-commands.js";
import { resolveAiReviewCommandTemplate } from "./ai-review-template.js";
import { buildTemplateContextFromTask, expandCommandTemplate } from "./command-template.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import {
  basePromptForRetry,
  emitOpencodeStreamDiag,
  healBlockFromObserver,
} from "./opencode-retry-diag.js";
import { resolveTaskWorkspaceForClaimedTask } from "./process-claimed-task-worktree.js";
import { runShellWithOptionalOpencodeJsonStream } from "./run-opencode-aware-shell.js";
import { buildWorkerChildEnv } from "./task-runtime-env.js";
import {
  AI_REVIEW_ERROR_CAP,
  AI_REVIEW_FIX_PROMPT_APPEND_CAP,
  AI_REVIEW_RESULT_SNIPPET_CAP,
  EXEC_OUTPUT_CAP,
  VERIFY_ERROR_CAP,
} from "./worker-output-limits.js";

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
};

function ev(payload: EventRecord): EventRecord {
  return payload;
}

export async function processClaimedTask(deps: ProcessClaimedTaskDeps): Promise<void> {
  const { task, workspaceDir: mainWorkspace, runsDir, taskCommands, eventRepo, clock } = deps;
  const taskId = String(task.task_id ?? "");
  const heartbeat = async () => {
    await taskCommands.touchHeartbeat(taskId);
  };

  if (await taskCommands.hasActiveDuplicateDedupeForTask(task)) {
    await taskCommands.updateStatus(taskId, "blocked", {
      blocked_reason: `duplicate dedupe_key: ${String(task.dedupe_key ?? "")}`,
    });
    await eventRepo.append(
      ev({
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

  const tplCtx = () => buildTemplateContextFromTask(task, runsDir, taskWorkspace);
  const env = buildWorkerChildEnv(task, runsDir, taskWorkspace, rootForNode, worktreeBranch);

  await taskCommands.updateStatus(taskId, "running");
  await eventRepo.append(ev({ ts: clock(), event: "task_running", task_id: taskId }));

  try {
    const execCmd = expandCommandTemplate(deps.commandTemplate, tplCtx());
    const { exitCode: execCode, output: execOut, streamObs: execStream } =
      await runShellWithOptionalOpencodeJsonStream(execCmd, {
        runShell: deps.runShell,
        onHeartbeat: heartbeat,
        env,
        enableStream: Boolean(deps.opencodeJsonEvents),
      });
    if (execCode !== 0) {
      const attempt = Number(task.attempt ?? 0);
      const healBlock = healBlockFromObserver(execStream);
      await emitOpencodeStreamDiag(eventRepo, clock, taskId, attempt + 1, "execute", execStream);
      const basePrompt = basePromptForRetry(String(task.prompt ?? ""));
      await taskCommands.updateStatus(taskId, "retry", {
        attempt: attempt + 1,
        last_error: execOut.slice(0, EXEC_OUTPUT_CAP),
        ...(healBlock
          ? {
              prompt: `${basePrompt}\n\n[opencode-heal]\n${healBlock}`,
            }
          : {}),
      });
      await eventRepo.append(
        ev({
          ts: clock(),
          event: "task_failed",
          task_id: taskId,
          attempt: attempt + 1,
          stage: "execute",
        })
      );
      await eventRepo.append(
        ev({
          ts: clock(),
          event: "task_retry",
          task_id: taskId,
          attempt: attempt + 1,
          stage: "execute",
        })
      );
      return;
    }

    if (String(deps.verifyCommandTemplate ?? "").trim()) {
      const verifyCmd = expandCommandTemplate(String(deps.verifyCommandTemplate), tplCtx());
      const { exitCode: verifyCode, output: verifyOut, streamObs: verifyStream } =
        await runShellWithOptionalOpencodeJsonStream(verifyCmd, {
          runShell: deps.runShell,
          onHeartbeat: heartbeat,
          env,
          enableStream: Boolean(deps.opencodeJsonEvents),
        });
      if (verifyCode !== 0) {
        const attempt = Number(task.attempt ?? 0);
        const healBlock = healBlockFromObserver(verifyStream);
        await emitOpencodeStreamDiag(eventRepo, clock, taskId, attempt + 1, "verify", verifyStream);
        const basePrompt = basePromptForRetry(String(task.prompt ?? ""));
        await taskCommands.updateStatus(taskId, "retry", {
          attempt: attempt + 1,
          last_error: `verify failed\n${verifyOut.slice(0, VERIFY_ERROR_CAP)}`,
          ...(healBlock ? { prompt: `${basePrompt}\n\n[opencode-heal]\n${healBlock}` } : {}),
        });
        await eventRepo.append(
          ev({
            ts: clock(),
            event: "task_failed",
            task_id: taskId,
            attempt: attempt + 1,
            stage: "verify",
          })
        );
        await eventRepo.append(
          ev({
            ts: clock(),
            event: "task_retry",
            task_id: taskId,
            attempt: attempt + 1,
            stage: "verify",
          })
        );
        return;
      }
    }

    const aiTpl = resolveAiReviewCommandTemplate(task, String(deps.aiReviewCommandTemplate ?? ""));
    if (deps.requireAiReview && task.skip_ai_review !== true && !aiTpl) {
      await taskCommands.updateStatus(taskId, "blocked", {
        blocked_reason:
          "require-ai-review: missing template (set worker --ai-review-command-template or task ai_review_command_template)",
      });
      await eventRepo.append(
        ev({
          ts: clock(),
          event: "task_blocked",
          task_id: taskId,
          reason: "require_ai_review_no_template",
        })
      );
      return;
    }

    let aiReviewOutput: string | undefined;
    if (aiTpl) {
      const aiCmd = expandCommandTemplate(aiTpl, tplCtx());
      const { exitCode: aiCode, output: aiOut, streamObs: aiStream } =
        await runShellWithOptionalOpencodeJsonStream(aiCmd, {
          runShell: deps.runShell,
          onHeartbeat: heartbeat,
          env,
          enableStream: Boolean(deps.opencodeJsonEvents),
        });
      aiReviewOutput = aiOut;
      if (aiCode !== 0) {
        const attempt = Number(task.attempt ?? 0);
        const fixBlock = aiOut.slice(0, AI_REVIEW_FIX_PROMPT_APPEND_CAP);
        const healBlock = healBlockFromObserver(aiStream);
        await emitOpencodeStreamDiag(eventRepo, clock, taskId, attempt + 1, "ai_review", aiStream);
        const basePrompt = basePromptForRetry(String(task.prompt ?? ""));
        const promptParts = [`${basePrompt}\n\n[ai-review-fix]\n${fixBlock}`];
        if (healBlock) promptParts.push(`\n\n[opencode-heal]\n${healBlock}`);
        await taskCommands.updateStatus(taskId, "retry", {
          attempt: attempt + 1,
          last_error: `ai-review failed\n${aiOut.slice(0, AI_REVIEW_ERROR_CAP)}`,
          prompt: promptParts.join(""),
        });
        await eventRepo.append(
          ev({
            ts: clock(),
            event: "task_failed",
            task_id: taskId,
            attempt: attempt + 1,
            stage: "ai_review",
          })
        );
        await eventRepo.append(
          ev({
            ts: clock(),
            event: "task_retry",
            task_id: taskId,
            attempt: attempt + 1,
            stage: "ai_review",
          })
        );
        return;
      }
      await eventRepo.append(ev({ ts: clock(), event: "task_ai_review_ok", task_id: taskId }));
    }

    const reviewExtra: JsonMap = {
      result: { exit_code: 0, output: execOut.slice(0, EXEC_OUTPUT_CAP) },
    };
    if (aiReviewOutput !== undefined) {
      (reviewExtra.result as JsonMap).ai_review_output = aiReviewOutput.slice(0, AI_REVIEW_RESULT_SNIPPET_CAP);
    }
    await taskCommands.updateStatus(taskId, "review", reviewExtra);
    await eventRepo.append(ev({ ts: clock(), event: "task_review", task_id: taskId }));
    if (deps.autoApproveReview) {
      await taskCommands.updateStatus(taskId, "approved");
      await taskCommands.updateStatus(taskId, "done");
      await eventRepo.append(ev({ ts: clock(), event: "task_done", task_id: taskId }));
    }
  } finally {
    disposeWorktree?.();
  }
}
