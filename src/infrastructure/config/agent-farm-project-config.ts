import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AgentFarmEmptyRunConfig = {
  enabled?: boolean;
  grace_minutes?: number;
  min_opencode_lines?: number;
};

export type AgentFarmProjectConfig = {
  empty_run?: AgentFarmEmptyRunConfig;
};

export function loadAgentFarmProjectConfig(workspaceRoot: string): AgentFarmProjectConfig | null {
  const path = join(workspaceRoot, ".agent-farm", "config.json");
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AgentFarmProjectConfig;
  } catch {
    return null;
  }
}
