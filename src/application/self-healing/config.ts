import type { AgentFarmProjectConfig } from "../contracts/agent-farm-project-config.js";

/** 自愈运行时配置（解析后的最终值） */
export type ResolvedSelfHealingConfig = {
  /** 最大自动重试次数（达到后进入 poison 降级） */
  maxRetries: number;
  /** poison 降级时备选模型列表（已去重、去空） */
  degradationModels: string[];
  /** 单次降级尝试最大等待时间（分钟） */
  timeoutMinutes: number;
  /** 空转检测后最大重试次数 */
  emptyRunMaxRetries: number;
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MINUTES = 30;
const DEFAULT_EMPTY_RUN_MAX_RETRIES = 2;

function envPositiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function envCommaList(name: string): string[] {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 解析自愈配置。优先级：env > 项目 config > 默认值。
 * 模型降级链：env AGENT_FARM_SELF_HEALING_DEGRADATION_MODEL > project config
 */
export function resolveSelfHealingConfig(
  project: AgentFarmProjectConfig | null,
): ResolvedSelfHealingConfig {
  const sh = project?.self_healing;
  const maxRetries = envPositiveInt("AGENT_FARM_SELF_HEALING_MAX_RETRIES", sh?.max_retries ?? DEFAULT_MAX_RETRIES);
  const timeoutMinutes = envPositiveInt("AGENT_FARM_SELF_HEALING_TIMEOUT_MINUTES", sh?.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES);
  const emptyRunMaxRetries = envPositiveInt("AGENT_FARM_SELF_HEALING_EMPTY_RUN_MAX_RETRIES", sh?.empty_run_max_retries ?? DEFAULT_EMPTY_RUN_MAX_RETRIES);

  const envModels = envCommaList("AGENT_FARM_SELF_HEALING_DEGRADATION_MODEL");
  const degradationModels = envModels.length > 0
    ? envModels
    : (sh?.degradation_models ?? []).filter(Boolean);

  return { maxRetries, degradationModels, timeoutMinutes, emptyRunMaxRetries };
}
