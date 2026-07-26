import type { JsonMap, TaskRecord } from "../../domain/task.js";
import type { ResolvedSelfHealingConfig } from "./config.js";

/**
 * 降级策略类型。
 * - `switch_model`: 切换到备选模型
 * - `degrade_prompt`: 在 prompt 中注入补救指令
 * - `retry`: 标准重试（不变更策略）
 */
export type DegradationAction =
  | { type: "switch_model"; model: string }
  | { type: "degrade_prompt"; patch: string }
  | { type: "retry" };

const DEGRADE_PROMPT_PATCH = `[self-healing]
上一次执行失败。请更仔细地分析失败原因，使用更保守的策略重试：
1. 先通读相关文件，理解现状
2. 用最小改动解决问题（只改必要的文件）
3. 每次修改后检查 git diff，确保修改范围可控
4. 如果原需求不合理，用最简方案替代并说明理由`;

/**
 * 为 poison/失败任务计算下一步降级策略。
 * 返回 null 表示降级链已耗尽，应转为 blocked。
 */
export function nextDegradationAction(
  task: TaskRecord,
  config: ResolvedSelfHealingConfig,
): DegradationAction | null {
  const degradationAttempt = Number(task.degradation_attempt ?? 0);
  const currentModel = String(task.model ?? process.env.AGENT_FARM_MODEL ?? "");

  // Step 0: 首次降解 → 切换模型（如果有备选）
  if (degradationAttempt === 0 && config.degradationModels.length > 0) {
    const fallbackModel = config.degradationModels[0]!;
    // 仅当备选模型与当前模型不同时才切换
    if (fallbackModel !== currentModel) {
      return { type: "switch_model", model: fallbackModel };
    }
  }

  // Step 1: 切换第一个备选模型
  if (degradationAttempt < config.degradationModels.length) {
    const model = config.degradationModels[degradationAttempt]!;
    if (model !== currentModel) {
      return { type: "switch_model", model };
    }
  }

  // Step N: 降级 prompt
  const alreadyDegradedPrompt = String(task.prompt ?? "").includes("[self-healing]");
  if (!alreadyDegradedPrompt) {
    return { type: "degrade_prompt", patch: DEGRADE_PROMPT_PATCH };
  }

  // Step N+1: 纯重试一次
  if (degradationAttempt <= config.degradationModels.length + 2) {
    return { type: "retry" };
  }

  // 耗尽
  return null;
}

/**
 * 应用降级策略到任务，返回修改后的 task fields（不包含完整 task，只返回需要 update 的字段）。
 */
export function applyDegradationAction(
  task: TaskRecord,
  action: DegradationAction,
): JsonMap {
  const attempt = Number(task.attempt ?? 0);
  const degradationAttempt = Number(task.degradation_attempt ?? 0) + 1;

  const patch: JsonMap = {
    attempt,
    degradation_attempt: degradationAttempt,
    status: "retry",
  };

  switch (action.type) {
    case "switch_model":
      patch.model = action.model;
      patch.last_error = `self-healing: switching model to ${action.model} (degradation attempt ${degradationAttempt})`;
      break;
    case "degrade_prompt": {
      const base = String(task.prompt ?? "");
      patch.prompt = base.includes("[self-healing]")
        ? base
        : `${base}\n\n${action.patch}`;
      patch.last_error = `self-healing: degrading prompt (degradation attempt ${degradationAttempt})`;
      break;
    }
    case "retry":
      patch.last_error = `self-healing: standard retry (degradation attempt ${degradationAttempt})`;
      break;
  }

  return patch;
}

/**
 * 判断降级链是否已完全耗尽。
 */
export function isDegradationExhausted(
  task: TaskRecord,
  config: ResolvedSelfHealingConfig,
): boolean {
  return nextDegradationAction(task, config) === null;
}
