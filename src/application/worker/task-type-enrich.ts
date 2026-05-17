/**
 * M4+ 任务类型路由增强：在 execute 前根据 task_type 追加 prompt_suffix 和 verify_strategy。
 */
import type { JsonMap } from "../../domain/task.js";
import type { AgentFarmProjectConfig } from "../contracts/agent-farm-project-config.js";
import { createTaskTypeRouter, isValidTaskType, type TaskType, type TaskTypeRoute } from "../executors/task-type-router.js";

/** 注入到 task 对象上的内部字段 */
const VERIFY_STRATEGY_KEY = "_verify_strategy";
const PROMPT_SUFFIX_APPLIED_KEY = "_prompt_suffix_applied";

export function enrichTaskWithTypeRoute(
  task: JsonMap,
  projectConfig?: AgentFarmProjectConfig | null,
): TaskTypeRoute | null {
  const rawType = String(task.task_type ?? "").trim();
  if (!rawType || !isValidTaskType(rawType)) return null;

  const taskType = rawType as TaskType;
  const router = createTaskTypeRouter();
  const overrides = projectConfig?.task_types?.[taskType];
  const route = router.route(taskType, overrides);

  const mutable = task as Record<string, unknown>;

  // 追加 prompt_suffix（仅一次）
  if (route.prompt_suffix && !mutable[PROMPT_SUFFIX_APPLIED_KEY]) {
    const existingPrompt = String(mutable.prompt ?? "");
    mutable.prompt = existingPrompt + route.prompt_suffix;
    mutable[PROMPT_SUFFIX_APPLIED_KEY] = true;
  }

  // 存储 verify_strategy 供 stage-verify 使用
  if (route.verify_strategy) {
    mutable[VERIFY_STRATEGY_KEY] = route.verify_strategy;
  }

  return route;
}

/** 读取任务上的 verify_strategy */
export function getVerifyStrategy(task: JsonMap): string | undefined {
  const v = (task as Record<string, unknown>)[VERIFY_STRATEGY_KEY];
  return typeof v === "string" ? v : undefined;
}

/** 判断是否应跳过 verify（diff_only / readonly / none 类型跳过） */
export function shouldSkipVerify(task: JsonMap): boolean {
  const strategy = getVerifyStrategy(task);
  if (!strategy) return false; // 未设置策略 → 默认不跳过
  return strategy !== "lint_test"; // lint_test 才跑 verify
}
