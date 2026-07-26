import { basePromptForRetry } from "./opencode-retry-diag.js";
import type { ClaimedTaskShellContext } from "./process-claimed-task/context.js";
import { appendTaskFailedRetry } from "./process-claimed-task/events.js";
import { taskEvent } from "./process-claimed-task/events.js";
import { writeExecuteStageReport } from "./execute-stage-report.js";
import { EXEC_OUTPUT_CAP } from "./worker-output-limits.js";
import { EMPTY_RUN_ABORT_MARKER, EMPTY_RUN_EXIT_CODE } from "./empty-run-config.js";
import type { EmptyRunCheckResult } from "./empty-run-monitor.js";
import {
  resolveSelfHealingConfig,
} from "../self-healing/config.js";

const EMPTY_RUN_FIX_TAG = "[empty-run-fix]";

export function stripEmptyRunFixAppendix(prompt: string): string {
  const idx = prompt.indexOf(`\n\n${EMPTY_RUN_FIX_TAG}`);
  if (idx === -1) return prompt;
  return prompt.slice(0, idx);
}

export function promptPatchForEmptyRun(graceMinutes: number): string {
  return `${EMPTY_RUN_FIX_TAG}
execute 已超过 ${graceMinutes} 分钟仍无 git diff 且 OpenCode 输出不足。你必须：
1. 先 Read 任务相关 src/ 与 docs/ 路径
2. ${graceMinutes} 分钟内必须有 git diff；每步后 git status
3. 若功能已实现，只补测试/文档缺口并提交，禁止长时间空转`;
}

const SELF_HEALING_PROMPT_PATCH = `[self-healing]
上一次执行出现空转（长时间无 git diff / 无输出）。请更保守地重试：
1. 如果功能已实现 → 仅补充测试和文档，不要重构
2. 如果需要实现 → 用最小可行方案，每次修改后立即检查 git diff
3. 如果需求不明确 → 输出你的理解并请求确认，不要猜测`;

export function isEmptyRunAbort(exitCode: number, output: string): boolean {
  return exitCode === EMPTY_RUN_EXIT_CODE && output.includes(EMPTY_RUN_ABORT_MARKER);
}

export async function handleEmptyRunAbort(
  ctx: ClaimedTaskShellContext,
  execOut: string,
  check: EmptyRunCheckResult,
): Promise<{ ok: false }> {
  const attemptPlus1 = ctx.taskAttempt + 1;
  const reason = check.reason ?? "empty-run";
  const emptyRunRetries = Number(ctx.task.empty_run_retries ?? 0);

  await ctx.eventRepo.append(
    taskEvent({
      ts: ctx.clock(),
      event: "task_empty_run_abort",
      task_id: ctx.taskId,
      attempt: attemptPlus1,
      reason,
      empty_run_retries: emptyRunRetries,
      meta: { signals: check.signals ?? [] },
    }),
  );

  writeExecuteStageReport(ctx.runsDir, ctx.taskId, attemptPlus1, ctx.clock(), EMPTY_RUN_EXIT_CODE, execOut);

  // 自愈降级策略：逐级尝试
  // Level 0: 注入 [empty-run-fix] 提示（原逻辑）
  // Level 1: 切换模型（如果配置了备选）
  // Level 2: 降级 prompt（注入 [self-healing]）
  // Level 3+: 耗尽 → failed

  const shConfig = resolveSelfHealingConfig(ctx.projectConfig);
  const maxRetries = shConfig.emptyRunMaxRetries;

  // Level 0: first empty-run → [empty-run-fix]
  if (emptyRunRetries === 0) {
    const basePrompt = stripEmptyRunFixAppendix(basePromptForRetry(String(ctx.task.prompt ?? "")));
    const patch = promptPatchForEmptyRun(ctx.emptyRunConfig.graceMinutes);
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: reason.slice(0, EXEC_OUTPUT_CAP),
      prompt: `${basePrompt}\n\n${patch}`,
      empty_run_retried: true,
      empty_run_retries: 1,
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
    await ctx.eventRepo.append(
      taskEvent({
        ts: ctx.clock(),
        event: "task_empty_run_retry",
        task_id: ctx.taskId,
        attempt: attemptPlus1,
        level: 0,
      }),
    );
    return { ok: false };
  }

  // Level 1: switch model (if degradation models configured)
  if (emptyRunRetries === 1 && shConfig.degradationModels.length > 0) {
    const fallbackModel = shConfig.degradationModels[0]!;
    const currentModel = String(ctx.task.model ?? process.env.AGENT_FARM_MODEL ?? "");
    if (fallbackModel !== currentModel) {
      const basePrompt = stripEmptyRunFixAppendix(basePromptForRetry(String(ctx.task.prompt ?? "")));
      await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
        attempt: attemptPlus1,
        last_error: `empty-run degradation: switching model ${currentModel} → ${fallbackModel}`.slice(0, EXEC_OUTPUT_CAP),
        prompt: basePrompt || String(ctx.task.prompt ?? ""),
        model: fallbackModel,
        empty_run_retries: 2,
      });
      await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
      await ctx.eventRepo.append(
        taskEvent({
          ts: ctx.clock(),
          event: "task_empty_run_retry",
          task_id: ctx.taskId,
          attempt: attemptPlus1,
          level: 1,
          model: fallbackModel,
        }),
      );
      console.warn(
        `[agent-farm] empty-run self-healing: task ${ctx.taskId} switching model ${currentModel} → ${fallbackModel}`,
      );
      return { ok: false };
    }
  }

  // Level 2: degrade prompt
  if (emptyRunRetries <= maxRetries) {
    const basePrompt = stripEmptyRunFixAppendix(basePromptForRetry(String(ctx.task.prompt ?? "")));
    const nextRetries = emptyRunRetries + 1;
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: `empty-run degradation: degraded prompt (retry ${nextRetries}/${maxRetries})`.slice(0, EXEC_OUTPUT_CAP),
      prompt: basePrompt
        ? `${basePrompt}\n\n${SELF_HEALING_PROMPT_PATCH}`
        : `${String(ctx.task.prompt ?? "")}\n\n${SELF_HEALING_PROMPT_PATCH}`,
      empty_run_retries: nextRetries,
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
    await ctx.eventRepo.append(
      taskEvent({
        ts: ctx.clock(),
        event: "task_empty_run_retry",
        task_id: ctx.taskId,
        attempt: attemptPlus1,
        level: nextRetries,
      }),
    );
    return { ok: false };
  }

  // 所有策略耗尽 → failed
  await ctx.taskCommands.updateStatus(ctx.taskId, "failed", {
    attempt: attemptPlus1,
    last_error: `${reason} (empty-run self-healing exhausted after ${emptyRunRetries} retries)`.slice(0, EXEC_OUTPUT_CAP),
  });
  await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
  await ctx.eventRepo.append(
    taskEvent({
      ts: ctx.clock(),
      event: "task_empty_run_failed",
      task_id: ctx.taskId,
      attempt: attemptPlus1,
      empty_run_retries: emptyRunRetries,
    }),
  );
  return { ok: false };
}
