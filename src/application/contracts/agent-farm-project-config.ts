export type AgentFarmEmptyRunConfig = {
  enabled?: boolean;
  grace_minutes?: number;
  min_opencode_lines?: number;
};

export type AgentFarmProjectConfig = {
  empty_run?: AgentFarmEmptyRunConfig;
  /** ADR-002：`shell-template`（默认）| `cursor-sdk` */
  executor?: string;
};

export type ProjectConfigPort = {
  load(workspaceRoot: string): AgentFarmProjectConfig | null;
};
