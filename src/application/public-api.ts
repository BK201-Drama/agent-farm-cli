/**
 * 稳定嵌入面（M2）：semver 约束前请勿破坏性改签名。
 * 使用：`import { ControlPlaneService, createContainer } from "agent-farm-cli/core"`
 */
export { ControlPlaneService } from "./facades/control-plane.js";
export { createControlPlaneService } from "../bootstrap/create-control-plane-service.js";
export type { ControlPlaneView, ControlPlanePaths } from "./facades/control-plane.js";
export type { ControlPlaneHealth } from "./facades/control-plane-health.js";
export { buildStuckReport, formatStuckBrief } from "./facades/stuck-report.js";
export type { StuckReport, StuckItem } from "./facades/stuck-report.js";
export { createContainer } from "../bootstrap/container.js";
export type { StoragePaths } from "../bootstrap/container.js";
export { defaultContainerPorts } from "../bootstrap/container-ports.js";
export type { ContainerPorts } from "../bootstrap/container-ports.js";
export { resolveExecuteExecutor, resolveExecutorId } from "./executors/resolve-execute-executor.js";
export {
  readPathsFromTask,
  enrichPromptWithReadPaths,
  buildTaskExecutorRunInput,
} from "./executors/task-executor-input.js";
export { warnJsonlStorageIfNeeded } from "../domain/task/storage-policy.js";
export { createCursorSdkExecutor, CURSOR_SDK_EXECUTOR_ID } from "../infrastructure/executors/cursor-sdk-executor.js";
export type { GitWorkspacePort } from "./contracts/git-workspace.js";
export type { ProjectConfigPort, AgentFarmProjectConfig } from "./contracts/agent-farm-project-config.js";
export { noopGitWorkspacePort, noopProjectConfigPort } from "./contracts/noop-ports.js";
export { validateWaveItem, validateWaveArray } from "./wave/wave-validate.js";
export type { ValidateWaveItemOptions } from "./wave/wave-validate.js";
export { validateTaskJsonBeforeEnqueue } from "./wave/validate-task-json.js";
export { createShellTemplateExecutor, SHELL_TEMPLATE_EXECUTOR_ID } from "./executors/shell-template-executor.js";
export type { ShellTemplateExecutorDeps } from "./executors/shell-template-executor.js";
export type { TaskExecutorPort, TaskExecutorRunInput, TaskExecutorRunResult } from "../domain/ports/task-executor.js";
export {
  resolveQueueWorkspace,
  resolveAgentFarmStorageFromEnv,
} from "../domain/task/queue-workspace-paths.js";
export type { ResolvedQueueWorkspace } from "../domain/task/queue-workspace-paths.js";
