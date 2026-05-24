import type { TaskExecutorPort } from "../../../domain/ports/task-executor.js";
import { buildTaskExecutorRunInput } from "../../executors/task-executor-input.js";
import type { AgentStreamObserver } from "../../../infrastructure/executors/opencode-shell-runner.js";
import type { ClaimedTaskShellContext } from "./context.js";

export type TemplateStageRunResult = {
  exit_code: number;
  output: string;
  streamObs?: AgentStreamObserver;
};

/** 使用已解析的 TaskExecutorPort 跑一阶段（execute / verify / ai-review） */
export async function runTemplateStage(
  ctx: ClaimedTaskShellContext,
  executor: TaskExecutorPort,
): Promise<TemplateStageRunResult> {
  const result = await executor.run(
    buildTaskExecutorRunInput(ctx.task, ctx.taskId, ctx.taskWorkspace, ctx.taskAttempt),
  );
  return {
    exit_code: result.exit_code,
    output: result.output,
    streamObs: result.meta?.streamObs as AgentStreamObserver | undefined,
  };
}
