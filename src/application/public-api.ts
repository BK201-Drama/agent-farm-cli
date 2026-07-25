/**
 * 稳定嵌入面（M2+）：semver 约束前请勿破坏性改签名。
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
export type { ContainerPorts } from "./contracts/container-ports.js";
export { resolveExecuteExecutor, resolveExecutorId } from "./executors/resolve-execute-executor.js";
export {
  readPathsFromTask,
  enrichPromptWithReadPaths,
  buildTaskExecutorRunInput,
} from "./executors/task-executor-input.js";
export { warnJsonlStorageIfNeeded } from "../domain/task/storage-policy.js";
export { createCursorSdkExecutor, CURSOR_SDK_EXECUTOR_ID } from "../infrastructure/executors/cursor-sdk-executor.js";
// Claude Code stream parser
export {
  createClaudeCodeJsonStreamObserver,
  stripClaudeHealAppendix,
  ensureClaudeRunStreamJson,
} from "../infrastructure/claude-code/claude-code-json-stream.js";
export type { ClaudeCodeStreamSummary } from "../infrastructure/claude-code/claude-code-json-stream.js";
// Generalized stream observer
export { commandLooksLikeClaudeRun } from "../infrastructure/executors/opencode-shell-runner.js";
export type { AgentStreamObserver, AgentStreamSummary } from "../domain/ports/agent-stream-observer.js";
export type { GitWorkspacePort } from "./contracts/git-workspace.js";
export type {
  ProjectConfigPort,
  AgentFarmProjectConfig,
  AgentFarmDecisionConfig,
  DecisionRuleConfig,
  TaskTypeRouteOverride,
} from "./contracts/agent-farm-project-config.js";

// Decision arbitration
export { DecisionService } from "./facades/decision-service.js";
export { DecisionEngine } from "./engines/decision-engine.js";
export { ShellLlmDecisionResolver, parseLlmDecisionOutput } from "./engines/llm-decision-resolver.js";
export type { DecisionEnginePort, DecisionRequest, DecisionResult, DecisionRecord, DecisionRule, LlmDecisionResolver } from "../domain/decision/model.js";
export { fingerprintContext, fingerprintSimilarity } from "../domain/decision/fingerprint.js";
export { matchRules } from "../domain/decision/rules.js";
export type { DecisionRepository } from "./contracts/decision-repository.js";
export { noopGitWorkspacePort, noopProjectConfigPort } from "./contracts/noop-ports.js";
export { validateWaveItem, validateWaveArray } from "./wave/wave-validate.js";
export type { ValidateWaveItemOptions } from "./wave/wave-validate.js";
export { validateTaskJsonBeforeEnqueue } from "./wave/validate-task-json.js";
export { createShellTemplateExecutor, SHELL_TEMPLATE_EXECUTOR_ID } from "./executors/shell-template-executor.js";
export type { ShellTemplateExecutorDeps } from "./executors/shell-template-executor.js";
export type { TaskExecutorPort, TaskExecutorRunInput, TaskExecutorRunResult } from "../domain/ports/task-executor.js";
export { resolveQueueWorkspace, resolveAgentFarmStorageFromEnv } from "../domain/task/queue-workspace-paths.js";
export type { ResolvedQueueWorkspace } from "../domain/task/queue-workspace-paths.js";

// M4+ 多模型路由
export { resolveModel, resolveModelFromContext, extractConfigModel } from "./executors/resolve-model.js";
// M4+ 任务类型路由器
export { createTaskTypeRouter, isValidTaskType, TASK_TYPES } from "./executors/task-type-router.js";
export type { TaskType, TaskTypeRoute, TaskTypeRouter } from "./executors/task-type-router.js";

// Polite concurrency gate
export type { Gate } from "./worker/polite-concurrency.js";
export { createGate, createWorktreeGate, createPostInstallGate, randomJitterMs } from "./worker/polite-concurrency.js";

// Resource leak scanner
export {
  runResourceLeakScan,
  scanGitLocks,
  detectOrphanWorktrees,
  cleanupOrphanWorktrees,
} from "./resource-leak-scanner.js";
export type { GitLockEntry, ResourceLeakScan } from "./resource-leak-scanner.js";
