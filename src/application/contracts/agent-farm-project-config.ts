export type AgentFarmEmptyRunConfig = {
  enabled?: boolean;
  grace_minutes?: number;
  min_opencode_lines?: number;
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

export type AgentFarmProjectConfig = {
  empty_run?: AgentFarmEmptyRunConfig;
  /** ADR-002/M4+：`shell-template`（默认）| `cursor-sdk` | `{ id, model }` */
  executor?: AgentFarmExecutorConfig;
  /** M4+ 用户自定义任务类型路由 */
  task_types?: Record<string, TaskTypeRouteOverride>;
};

export type ProjectConfigPort = {
  load(workspaceRoot: string): AgentFarmProjectConfig | null;
};
