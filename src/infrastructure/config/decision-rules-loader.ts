import type { DecisionRule } from "../../domain/decision/model.js";
import type { DecisionRuleConfig, AgentFarmDecisionConfig } from "../../application/contracts/agent-farm-project-config.js";

/**
 * 将配置格式的规则转换为领域 DecisionRule。
 * 只做形状映射，不做验证 — 验证由 config schema 层负责。
 */
export function toDecisionRule(cfg: DecisionRuleConfig): DecisionRule {
  return {
    id: cfg.id,
    description: cfg.description,
    context_patterns: cfg.context_patterns,
    option_patterns: cfg.option_patterns,
    preferred_option: cfg.preferred_option,
    default_choice: cfg.default_choice,
    priority: cfg.priority,
  };
}

/**
 * 从项目配置中加载决策规则列表。
 * 当 decision 未启用且无规则时返回空数组。
 */
export function loadDecisionRules(decisionConfig?: AgentFarmDecisionConfig): DecisionRule[] {
  if (!decisionConfig?.enabled && !decisionConfig?.rules?.length) return [];
  return (decisionConfig.rules ?? []).map(toDecisionRule);
}
