/** 决策仲裁层 — 领域类型 */

/** Worker 上报的决策请求 */
export type DecisionRequest = {
  task_id: string;
  /** worker 生成的唯一 ID */
  decision_id: string;
  /** 自然语言描述决策上下文 */
  context: string;
  /** 候选方案列表 */
  options: string[];
  /** worker 的推荐选择 */
  recommendation?: string;
  /** 触发决策的管线阶段 */
  stage: "execute" | "verify" | "ai_review";
  /** 当前 task attempt */
  attempt: number;
};

/** 决策结果 — discriminated union */
export type DecisionResult =
  | {
      decision_id: string;
      chosen: string;
      reason: string;
      resolved_by: "rule" | "history" | "llm";
      confidence: number;
      escalated: false;
    }
  | {
      decision_id: string;
      escalated: true;
      escalation_id: string;
      reason: string;
    };

/** 持久化的决策历史记录 */
export type DecisionRecord = {
  id: string;
  task_id: string;
  decision_id: string;
  context: string;
  /** 归一化 token 串（空格分隔），用于 Jaccard 相似度搜索 */
  context_fingerprint: string;
  options: string[];
  /** 最终选择（升级未决时为 null） */
  chosen: string | null;
  reason: string;
  resolved_by: "rule" | "history" | "llm" | "human" | null;
  confidence: number | null;
  status: "resolved" | "escalated" | "pending" | "rejected" | "timed_out";
  created_at: string;
  resolved_at?: string;
};

/** 决策规则 — 从 project config 加载 */
export type DecisionRule = {
  id: string;
  description: string;
  /** 子串匹配（大小写不敏感），任一命中即触发 */
  context_patterns: string[];
  /** 可选: 匹配 option 名的模式（任一命中即确认适用） */
  option_patterns?: string[];
  /** 优先选此 option（大小写不敏感匹配 request.options 中的项） */
  preferred_option?: string;
  /** 固定答案（直接返回此值，不匹配 options） */
  default_choice?: string;
  /** 优先级（越大越先评估，默认 0） */
  priority?: number;
};

/** 决策引擎端口 */
export interface DecisionEnginePort {
  evaluate(request: DecisionRequest): Promise<DecisionResult>;
  resolveEscalation(escalationId: string, choice: string, reason: string): Promise<DecisionRecord>;
  getRules(): DecisionRule[];
}

/** LLM 裁决器端口 — 在规则和历史均未命中时调用 */
export interface LlmDecisionResolver {
  /**
   * 使用 project-level context 裁决决策。
   * @param request 决策请求
   * @param projectContext 项目上下文（CLAUDE.md、package.json、历史决策摘要等）
   * @returns 裁决结果，或 null 表示 LLM 无法裁决（应继续升级）
   */
  resolve(request: DecisionRequest, projectContext: string): Promise<DecisionResult | null>;
}
