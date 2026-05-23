import type { AgentFarmProjectConfig } from "../contracts/agent-farm-project-config.js";
import type { JsonMap } from "../../domain/task.js";
import type { TaskExecutorPort } from "../../domain/ports/task-executor.js";
import { createCursorSdkExecutor, CURSOR_SDK_EXECUTOR_ID } from "../../infrastructure/executors/cursor-sdk-executor.js";
import { createShellTemplateExecutor, type ShellTemplateExecutorDeps } from "./shell-template-executor.js";
import type { OpencodeStreamObserver } from "../../infrastructure/executors/opencode-shell-runner.js";
import { resolveModelFromContext } from "./resolve-model.js";

export function resolveExecutorId(task: JsonMap, projectConfig?: AgentFarmProjectConfig | null): string {
  const fromTask = String(task.executor ?? "").trim();
  if (fromTask) return fromTask.toLowerCase();
  const fromCfg =
    typeof projectConfig?.executor === "string" ? projectConfig.executor : (projectConfig?.executor?.id ?? "");
  if (fromCfg.trim()) return fromCfg.trim().toLowerCase();
  const fromEnv = process.env.AGENT_FARM_EXECUTOR?.trim();
  if (fromEnv) return fromEnv.toLowerCase();
  return "shell-template";
}

/** execute 阶段：shell-template（默认）或 cursor-sdk（ADR-002）+ M4+ model 路由 */
export function resolveExecuteExecutor(
  task: JsonMap,
  commandTemplate: string,
  shellDeps: Omit<ShellTemplateExecutorDeps, "commandTemplate"> & {
    onStreamObserver?: (obs: OpencodeStreamObserver) => void;
    shouldAbort?: () => Promise<boolean>;
  },
  projectConfig?: AgentFarmProjectConfig | null,
): TaskExecutorPort {
  const id = resolveExecutorId(task, projectConfig);

  // M4+ 解析模型（三级优先级：task.model > config.executor.model > AGENT_FARM_MODEL）
  const resolvedModel = resolveModelFromContext(task, projectConfig);
  // 注入 task 对象供 template context 使用
  if (resolvedModel) {
    (task as Record<string, unknown>)._resolved_model = resolvedModel;
  }

  if (id === CURSOR_SDK_EXECUTOR_ID || id === "cursor_sdk") {
    return createCursorSdkExecutor(resolvedModel);
  }
  return createShellTemplateExecutor({
    commandTemplate,
    getTemplateContext: shellDeps.getTemplateContext,
    runShell: shellDeps.runShell,
    env: shellDeps.env,
    onHeartbeat: shellDeps.onHeartbeat,
    shouldAbort: shellDeps.shouldAbort,
    onStreamObserver: shellDeps.onStreamObserver,
    enableOpencodeStream: shellDeps.enableOpencodeStream,
  });
}
