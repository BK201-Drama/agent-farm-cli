/**
 * Worker 模块 barrel export。
 *
 * 导出 polite-concurrency（并发门）供上层消费。
 * 注意：具体 gate 的 worktree/npm-install 接入由调用方完成，
 * gate 本身只提供 acquire/release 互斥原语。
 */
export type { Gate } from "./polite-concurrency.js";
export {
  createGate,
  createWorktreeGate,
  createPostInstallGate,
  randomJitterMs,
} from "./polite-concurrency.js";

export type { GitLockEntry, ResourceLeakScan } from "../resource-leak-scanner.js";
export {
  scanGitLocks,
  detectOrphanWorktrees,
  cleanupOrphanWorktrees,
  runResourceLeakScan,
} from "../resource-leak-scanner.js";
