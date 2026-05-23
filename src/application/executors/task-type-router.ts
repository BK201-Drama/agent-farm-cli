/**
 * M4+ 任务类型路由器：按 task_type 自动选择 executor/model/prompt/verify 策略。
 */
import type { TaskTypeRouteOverride } from "../contracts/agent-farm-project-config.js";

export type TaskType = "code_gen" | "doc_gen" | "test_gen" | "code_review" | "migration" | "i18n" | "refactor";

export const TASK_TYPES: readonly TaskType[] = [
  "code_gen",
  "doc_gen",
  "test_gen",
  "code_review",
  "migration",
  "i18n",
  "refactor",
] as const;

export function isValidTaskType(v: string): v is TaskType {
  return (TASK_TYPES as readonly string[]).includes(v);
}

export type TaskTypeRoute = {
  default_model?: string;
  default_executor?: string;
  prompt_suffix?: string;
  verify_strategy: "lint_test" | "diff_only" | "readonly" | "none";
};

const DEFAULT_ROUTES: Record<TaskType, TaskTypeRoute> = {
  code_gen: {
    default_model: undefined,
    default_executor: undefined,
    prompt_suffix: undefined,
    verify_strategy: "lint_test",
  },
  doc_gen: {
    default_model: "gpt-4o-mini",
    default_executor: "shell-template",
    prompt_suffix: "\n\n输出格式为 Markdown，将文档置于 docs/ 目录下。不要修改任何源代码。",
    verify_strategy: "diff_only",
  },
  test_gen: {
    default_model: undefined,
    default_executor: undefined,
    prompt_suffix: "\n\n覆盖边界情况、异常路径和空值处理。测试必须能通过。",
    verify_strategy: "lint_test",
  },
  code_review: {
    default_model: undefined,
    default_executor: undefined,
    prompt_suffix: "\n\n只读模式：不要修改任何文件。输出审查意见为 Markdown 清单。",
    verify_strategy: "readonly",
  },
  migration: {
    default_model: undefined,
    default_executor: undefined,
    prompt_suffix: "\n\n分步迁移，每步保持代码可编译。迁移完成后确保所有测试通过。",
    verify_strategy: "lint_test",
  },
  i18n: {
    default_model: "gpt-4o-mini",
    default_executor: "shell-template",
    prompt_suffix: "\n\n提取所有硬编码中文字符串为 i18n key，不要改变任何业务逻辑。",
    verify_strategy: "lint_test",
  },
  refactor: {
    default_model: undefined,
    default_executor: undefined,
    prompt_suffix: "\n\n重构不改变任何外部行为。确保所有现有测试继续通过。",
    verify_strategy: "lint_test",
  },
};

export type TaskTypeRouter = {
  route(taskType: TaskType, overrides?: TaskTypeRouteOverride): TaskTypeRoute;
  listTypes(): readonly TaskType[];
};

export function createTaskTypeRouter(): TaskTypeRouter {
  return {
    route(taskType: TaskType, overrides?: TaskTypeRouteOverride): TaskTypeRoute {
      const base = DEFAULT_ROUTES[taskType];
      if (!overrides) return { ...base };
      return {
        default_model: overrides.default_model ?? base.default_model,
        default_executor: overrides.default_executor ?? base.default_executor,
        prompt_suffix: overrides.prompt_suffix ?? base.prompt_suffix,
        verify_strategy: overrides.verify_strategy ?? base.verify_strategy,
      };
    },
    listTypes(): readonly TaskType[] {
      return TASK_TYPES;
    },
  };
}
