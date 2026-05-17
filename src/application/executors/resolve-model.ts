/**
 * M4+ 多模型路由：三级优先级解析。
 *
 * 优先级（从高到低）：
 *   1. task.model（wave 任务字段）
 *   2. config.executor.model（项目级配置）
 *   3. AGENT_FARM_MODEL 环境变量
 *   4. undefined（不指定，executor 自行决定）
 */
import type { JsonMap } from "../../domain/task.js";
import type { AgentFarmProjectConfig } from "../contracts/agent-farm-project-config.js";

/**
 * 从任务、配置、环境变量中解析最终使用的模型标识符。
 * @returns 模型名（如 "claude-opus"），或 undefined 表示不指定
 */
export function resolveModel(
  taskModel?: string | null,
  configModel?: string | null,
  envModel?: string | null,
): string | undefined {
  const fromTask = (taskModel ?? "").trim();
  if (fromTask) return fromTask;

  const fromConfig = (configModel ?? "").trim();
  if (fromConfig) return fromConfig;

  const fromEnv = (envModel ?? "").trim();
  if (fromEnv) return fromEnv;

  return undefined;
}

/** 解析 config.executor 为 model（兼容 string 和 object 格式） */
export function extractConfigModel(config?: AgentFarmProjectConfig | null): string | undefined {
  if (!config?.executor) return undefined;
  if (typeof config.executor === "object") {
    return config.executor.model?.trim() || undefined;
  }
  return undefined; // string 格式不含 model 信息
}

/** 从 task + config + env 一站式解析 */
export function resolveModelFromContext(
  task: JsonMap,
  projectConfig?: AgentFarmProjectConfig | null,
): string | undefined {
  return resolveModel(
    String(task.model ?? "").trim() || undefined,
    extractConfigModel(projectConfig),
    process.env.AGENT_FARM_MODEL?.trim() || undefined,
  );
}
