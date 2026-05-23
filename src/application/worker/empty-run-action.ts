import { basePromptForRetry } from "./opencode-retry-diag.js";
import type { ClaimedTaskShellContext } from "./process-claimed-task/context.js";
import { appendTaskFailedRetry } from "./process-claimed-task/events.js";
import { taskEvent } from "./process-claimed-task/events.js";
import { writeExecuteStageReport } from "./execute-stage-report.js";
import { EXEC_OUTPUT_CAP } from "./worker-output-limits.js";
import { EMPTY_RUN_ABORT_MARKER, EMPTY_RUN_EXIT_CODE } from "./empty-run-config.js";
import type { EmptyRunCheckResult } from "./empty-run-monitor.js";

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
  const alreadyRetried = ctx.task.empty_run_retried === true;

  await ctx.eventRepo.append(
    taskEvent({
      ts: ctx.clock(),
      event: "task_empty_run_abort",
      task_id: ctx.taskId,
      attempt: attemptPlus1,
      reason,
      meta: { signals: check.signals ?? [] },
    }),
  );

  writeExecuteStageReport(ctx.runsDir, ctx.taskId, attemptPlus1, ctx.clock(), EMPTY_RUN_EXIT_CODE, execOut);

  if (!alreadyRetried) {
    const basePrompt = stripEmptyRunFixAppendix(basePromptForRetry(String(ctx.task.prompt ?? "")));
    const patch = promptPatchForEmptyRun(ctx.emptyRunConfig.graceMinutes);
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: reason.slice(0, EXEC_OUTPUT_CAP),
      prompt: `${basePrompt}\n\n${patch}`,
      empty_run_retried: true,
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
    await ctx.eventRepo.append(
      taskEvent({
        ts: ctx.clock(),
        event: "task_empty_run_retry",
        task_id: ctx.taskId,
        attempt: attemptPlus1,
      }),
    );
    return { ok: false };
  }

  await ctx.taskCommands.updateStatus(ctx.taskId, "failed", {
    attempt: attemptPlus1,
    last_error: `${reason} (empty-run retry exhausted)`.slice(0, EXEC_OUTPUT_CAP),
  });
  await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
  await ctx.eventRepo.append(
    taskEvent({
      ts: ctx.clock(),
      event: "task_empty_run_failed",
      task_id: ctx.taskId,
      attempt: attemptPlus1,
    }),
  );
  return { ok: false };
}
