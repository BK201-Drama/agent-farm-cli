import type { IsoClock } from "../../domain/ports/clock.js";
import type { DecisionEnginePort, DecisionRecord, DecisionRequest, DecisionResult, DecisionRule, LlmDecisionResolver } from "../../domain/decision/model.js";
import { fingerprintContext, fingerprintSimilarity, fingerprintFromString, fingerprintToString } from "../../domain/decision/fingerprint.js";
import { matchRules } from "../../domain/decision/rules.js";
import type { DecisionRepository } from "../contracts/decision-repository.js";

export class DecisionEngine implements DecisionEnginePort {
  constructor(
    private readonly ruleBase: DecisionRule[],
    private readonly decisionRepo: DecisionRepository,
    private readonly autoThreshold: number,
    private readonly clock: IsoClock,
    private readonly llmResolver?: LlmDecisionResolver,
  ) {}

  async evaluate(request: DecisionRequest): Promise<DecisionResult> {
    // Step 1: Rule matching
    const ruleMatch = matchRules(request, this.ruleBase);
    if (ruleMatch && !ruleMatch.escalated && ruleMatch.confidence >= this.autoThreshold) {
      return ruleMatch;
    }

    // Step 2: Historical similarity via fingerprint
    const fpTokens = fingerprintContext(request.context, request.options);
    const fp = fingerprintToString(fpTokens);
    const similar = await this.decisionRepo.findSimilar(request.task_id, fp, 0.7);
    if (similar.length > 0) {
      const best = similar[0]!;
      if (best._similarity >= this.autoThreshold) {
        return {
          decision_id: request.decision_id,
          chosen: best.chosen!,
          reason: `Historical decision #${best.id} (${Math.round(best._similarity * 100)}% similar): ${best.reason}`,
          resolved_by: "history",
          confidence: best._similarity,
          escalated: false,
        };
      }
    }

    // Step 3: LLM resolver (if configured)
    if (this.llmResolver) {
      const projectCtx = this.buildProjectContext();
      try {
        const llmResult = await this.llmResolver.resolve(request, projectCtx);
        if (llmResult && !llmResult.escalated && llmResult.confidence >= this.autoThreshold) {
          return llmResult;
        }
      } catch {
        // LLM resolver failed — fall through to escalation
      }
    }

    // Step 4: Escalate to human
    return {
      decision_id: request.decision_id,
      escalated: true,
      escalation_id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      reason: "No matching rules or historical precedent. Needs human input.",
    };
  }

  /**
   * 构建供 LLM 裁决器使用的项目上下文。
   * 包含规则库摘要和历史决策摘要。
   */
  private buildProjectContext(): string {
    const parts: string[] = [];

    if (this.ruleBase.length > 0) {
      parts.push("=== 项目决策规则 ===");
      for (const rule of this.ruleBase) {
        parts.push(`- [${rule.id}] ${rule.description} (patterns: ${rule.context_patterns.join(", ")})`);
      }
    }

    return parts.join("\n");
  }

  async resolveEscalation(escalationId: string, choice: string, reason: string): Promise<DecisionRecord> {
    const record = await this.decisionRepo.findById(escalationId);
    if (!record) {
      throw new Error(`Escalation ${escalationId} not found`);
    }

    const updated = await this.decisionRepo.update(escalationId, {
      chosen: choice,
      reason: `${record.reason}\n[Resolved by human] ${reason}`,
      resolved_by: "human",
      status: "resolved",
      resolved_at: this.clock(),
    });

    return updated;
  }

  getRules(): DecisionRule[] {
    return this.ruleBase;
  }
}
