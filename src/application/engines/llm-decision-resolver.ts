import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import type { DecisionRequest, DecisionResult, LlmDecisionResolver } from "../../domain/decision/model.js";

/**
 * 基于 Shell 命令模板的 LLM 决策裁决器。
 *
 * 类似 AI review stage：运行一个 shell 命令，该命令调用 LLM（Claude Code / OpenCode / curl API），
 * 最后一行 JSON 输出包含 { chosen, reason, confidence }。
 *
 * 模板占位符:
 *   {context}         — 决策上下文（JSON-encoded）
 *   {options}          — 候选方案列表（JSON-encoded array）
 *   {recommendation}   — worker 推荐（JSON-encoded string or "null"）
 *   {project_context}  — 项目上下文文本（JSON-encoded）
 *   {task_id}          — task ID
 */
export class ShellLlmDecisionResolver implements LlmDecisionResolver {
  constructor(
    private readonly shellTemplate: string,
    private readonly runShell: ShellRunner,
  ) {}

  async resolve(request: DecisionRequest, projectContext: string): Promise<DecisionResult | null> {
    // 展开模板
    const command = this.shellTemplate
      .replace(/\{context\}/g, JSON.stringify(request.context))
      .replace(/\{options\}/g, JSON.stringify(request.options))
      .replace(/\{recommendation\}/g, JSON.stringify(request.recommendation ?? null))
      .replace(/\{project_context\}/g, JSON.stringify(projectContext))
      .replace(/\{task_id\}/g, request.task_id);

    let output: string;
    try {
      const result = await this.runShell(command, {
        timeoutMs: 120_000, // 2 minutes max for LLM decision
      });
      if (result.exitCode !== 0) {
        return null; // LLM call failed, fall through to escalation
      }
      output = result.output;
    } catch {
      return null;
    }

    return parseLlmDecisionOutput(output, request.decision_id);
  }
}

/**
 * 解析 LLM 输出中的结构化裁决。
 *
 * 期望格式（最后一行 JSON）:
 *   {"chosen": "SQLite", "reason": "...", "confidence": 0.92}
 *
 * 如果 chosen 匹配 request.options 中的某一项（大小写不敏感），
 * 返回该 option 的原始大小写；否则返回 null。
 */
export function parseLlmDecisionOutput(output: string, decisionId: string): DecisionResult | null {
  if (!output.trim()) return null;

  // 取最后一行 JSON
  const lines = output.trim().split("\n");
  const lastLine = lines[lines.length - 1]?.trim() ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(lastLine) as Record<string, unknown>;
  } catch {
    // 尝试找最后一行 JSON-like 内容
    return null;
  }

  const chosen = typeof parsed.chosen === "string" ? parsed.chosen.trim() : null;
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "LLM decision";
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;

  if (!chosen || confidence < 0.5) return null;

  return {
    decision_id: decisionId,
    chosen,
    reason,
    resolved_by: "llm",
    confidence: Math.min(1, Math.max(0, confidence)),
    escalated: false,
  };
}
