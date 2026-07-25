export type AgentFarmEmptyRunConfig = {
  enabled?: boolean;
  grace_minutes?: number;
  min_opencode_lines?: number;
  /** 通用 agent NDJSON 最低行数（替代旧名 min_opencode_lines） */
  min_agent_lines?: number;
  /** 最低 tool call 次数（低于此值视为无工具调用进展） */
  min_tool_calls?: number;
};

/** M4+ executor 配置，兼容旧 string 格式 */
export type AgentFarmExecutorConfig =
  | string
  | {
      id?: string;
      model?: string;
    };

/** M4+ 任务类型路由覆盖 */
export type TaskTypeRouteOverride = {
  default_model?: string;
  default_executor?: string;
  prompt_suffix?: string;
  verify_strategy?: "lint_test" | "diff_only" | "readonly" | "none";
};

/** 决策仲裁规则 */
export type DecisionRuleConfig = {
  id: string;
  description: string;
  context_patterns: string[];
  option_patterns?: string[];
  preferred_option?: string;
  default_choice?: string;
  priority?: number;
};

/** 决策引擎配置 */
export type AgentFarmDecisionConfig = {
  enabled?: boolean;
  auto_threshold?: number;
  rules?: DecisionRuleConfig[];
  /** LLM 裁决器 — shell 命令模板。占位符: {context} {options} {recommendation} {project_context} {task_id} */
  llm_command_template?: string;
};

export type AgentFarmProjectConfig = {
  empty_run?: AgentFarmEmptyRunConfig;
  /** ADR-002/M4+：`shell-template`（默认）| `cursor-sdk` | `{ id, model }` */
  executor?: AgentFarmExecutorConfig;
  /** M4+ 用户自定义任务类型路由 */
  task_types?: Record<string, TaskTypeRouteOverride>;
  /** Webhook 通知端点列表 */
  webhooks?: Array<{
    url: string;
    events: string[];
    secret?: string;
  }>;
  /** 决策仲裁配置 */
  decision?: AgentFarmDecisionConfig;
};

export type ProjectConfigPort = {
  load(workspaceRoot: string): AgentFarmProjectConfig | null;
};
