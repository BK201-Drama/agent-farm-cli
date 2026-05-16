import type { JsonMap } from "../../domain/task.js";
import type { AgentFarmProjectConfig } from "../../infrastructure/config/agent-farm-project-config.js";

export const EMPTY_RUN_EXIT_CODE = 125;
export const EMPTY_RUN_ABORT_MARKER = "[agent-farm] empty-run abort";

export type ResolvedEmptyRunConfig = {
  enabled: boolean;
  graceMinutes: number;
  minOpencodeLines: number;
};

const DEFAULT_GRACE_MINUTES = 10;
const DEFAULT_MIN_OPENCODE_LINES = 1;

function envFlag(name: string, defaultValue: boolean): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return defaultValue;
}

function envPositiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** 全局 < 项目 config < 任务字段。 */
export function resolveEmptyRunConfig(
  project: AgentFarmProjectConfig | null,
  task: JsonMap,
): ResolvedEmptyRunConfig {
  const projectEr = project?.empty_run;
  let enabled = envFlag("AGENT_FARM_EMPTY_RUN", true);
  let graceMinutes = envPositiveInt("AGENT_FARM_EMPTY_RUN_GRACE_MINUTES", DEFAULT_GRACE_MINUTES);
  let minOpencodeLines = envPositiveInt(
    "AGENT_FARM_EMPTY_RUN_MIN_OPENCODE_LINES",
    DEFAULT_MIN_OPENCODE_LINES,
  );

  if (projectEr?.enabled !== undefined) enabled = Boolean(projectEr.enabled);
  if (projectEr?.grace_minutes !== undefined) {
    graceMinutes = Math.max(1, Math.floor(Number(projectEr.grace_minutes)));
  }
  if (projectEr?.min_opencode_lines !== undefined) {
    minOpencodeLines = Math.max(0, Math.floor(Number(projectEr.min_opencode_lines)));
  }

  if (task.empty_run_disabled === true) enabled = false;
  if (task.empty_run_enabled === true) enabled = true;
  if (task.empty_run_grace_minutes != null) {
    graceMinutes = Math.max(1, Math.floor(Number(task.empty_run_grace_minutes)));
  }
  if (task.empty_run_min_opencode_lines != null) {
    minOpencodeLines = Math.max(0, Math.floor(Number(task.empty_run_min_opencode_lines)));
  }

  return { enabled, graceMinutes, minOpencodeLines };
}
