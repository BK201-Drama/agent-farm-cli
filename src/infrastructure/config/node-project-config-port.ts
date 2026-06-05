import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentFarmProjectConfig,
  ProjectConfigPort,
} from "../../application/contracts/agent-farm-project-config.js";

export function loadAgentFarmProjectConfig(workspaceRoot: string): AgentFarmProjectConfig | null {
  const path = join(workspaceRoot, ".agent-farm", "config.json");
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AgentFarmProjectConfig;
  } catch (err) {
    console.error(`[agent-farm] failed to parse project config ${path}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export const nodeProjectConfigPort: ProjectConfigPort = {
  load: loadAgentFarmProjectConfig,
};
