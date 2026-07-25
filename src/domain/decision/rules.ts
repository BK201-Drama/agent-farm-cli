import type { DecisionRequest, DecisionResult, DecisionRule } from "./model.js";

/**
 * 纯函数 — 将请求与规则库匹配，返回裁决结果或 null。
 * 按 priority 降序遍历规则，首个命中且置信度足够的规则即为结果。
 */
export function matchRules(request: DecisionRequest, rules: DecisionRule[]): DecisionResult | null {
  if (!rules || rules.length === 0) return null;

  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const ctx = request.context.toLowerCase();

  for (const rule of sorted) {
    const matchedPatterns = rule.context_patterns.filter((p) => ctx.includes(p.toLowerCase()));
    if (matchedPatterns.length === 0) continue;

    // 如果规则指定了 option_patterns，检查请求的 options 中是否有任一匹配
    if (rule.option_patterns && rule.option_patterns.length > 0) {
      const hasMatchingOption = request.options.some((opt) =>
        rule.option_patterns!.some((p) => opt.toLowerCase().includes(p.toLowerCase())),
      );
      if (!hasMatchingOption) continue;
    }

    // 计算置信度
    const confidence = calculateRuleConfidence(rule, request, matchedPatterns.length);

    // 确定 chosen
    const chosen = resolveChoice(rule, request);
    if (chosen === null) continue; // preferred_option 不在候选列表中

    return {
      decision_id: request.decision_id,
      chosen,
      reason: `Rule "${rule.id}": ${rule.description} (matched: ${matchedPatterns.join(", ")})`,
      resolved_by: "rule",
      confidence,
      escalated: false,
    };
  }

  return null;
}

/**
 * 计算规则匹配的置信度。
 * 基础分 = 命中 pattern 数 / 总 pattern 数。
 * option 匹配加分 0.1（上限 1.0）。
 */
export function calculateRuleConfidence(
  rule: DecisionRule,
  _request: DecisionRequest,
  matchedPatternCount?: number,
): number {
  const count = matchedPatternCount ?? rule.context_patterns.length;
  let confidence = count / Math.max(1, rule.context_patterns.length);

  if (rule.option_patterns && rule.option_patterns.length > 0) {
    confidence = Math.min(1, confidence + 0.1);
  }

  return Math.round(confidence * 100) / 100; // 保留两位小数
}

/**
 * 根据规则确定最终选择的 option。
 * default_choice > preferred_option > request.recommendation > first option。
 * 返回 null 表示 preferred_option 不在 request.options 中（规则不适用）。
 */
function resolveChoice(rule: DecisionRule, request: DecisionRequest): string | null {
  if (rule.default_choice) {
    return rule.default_choice;
  }

  if (rule.preferred_option) {
    const found = request.options.find(
      (o) => o.toLowerCase() === rule.preferred_option!.toLowerCase(),
    );
    if (!found) return null;
    return found;
  }

  return request.recommendation ?? request.options[0] ?? null;
}
