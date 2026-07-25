import type { ClaimedTaskShellContext } from "./context.js";

export type AwaitingDecisionStageResult =
  | { kind: "ok" }
  | { kind: "awaiting_decision"; escalation_id: string }
  | { kind: "fail"; reason: string };

/**
 * 决策门禁阶段。
 *
 * 在 execute/verify 阶段之后、review/done 之前运行。
 * 检查 task 是否被 MCP bridge（通过 farm_request_decision 工具）转入了
 * awaiting_decision 状态。如果是，释放 worker 并等待决策解决后重试。
 *
 * 这个 stage 本身不做裁决 — 裁决由 MCP bridge path 或直接集成 path 完成。
 * 这里只检查结果。
 */
export async function runAwaitingDecisionStage(
  ctx: ClaimedTaskShellContext,
  opts: {
    decisionEngineEnabled: boolean;
  },
): Promise<AwaitingDecisionStageResult> {
  if (!opts.decisionEngineEnabled) {
    return { kind: "ok" };
  }

  // 检查 task 当前状态是否被 MCP bridge 转入了 awaiting_decision
  const currentStatus = String(ctx.task.status ?? "");
  if (currentStatus === "awaiting_decision") {
    const escalationId = String((ctx.task as Record<string, unknown>)._escalation_id ?? "");
    return {
      kind: "awaiting_decision",
      escalation_id: escalationId || "unknown",
    };
  }

  return { kind: "ok" };
}
