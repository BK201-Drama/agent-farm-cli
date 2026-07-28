/**
 * Spec Acceptance Runtime — 验收状态查询
 *
 * reconcile 同步最新状态后判定整体完成度：
 * done = 所有 item pass 且 demo pass。
 * 应用层通过 `getAcceptanceStatus(opts)` 调用。
 */
import { reconcileAcceptanceProgress } from "./reconcile.js";
import type { AcceptanceProgress, AcceptanceSpec } from "./types.js";

// ── 类型 ──────────────────────────────────────────────────────────────

export interface GetAcceptanceStatusOptions {
  /** 当前进度快照 */
  progress: AcceptanceProgress;
  /** dedupe_key → task status（来自队列查询） */
  taskStatuses: Map<string, string>;
  /** 当前时间 ISO 字符串（默认 now） */
  nowIso?: string;
}

export interface AcceptanceStatus {
  /** 所有 item pass 且 demo pass */
  done: boolean;
  /** reconcile 后的最新进度 */
  progress: AcceptanceProgress;
}

// ── 实现 ──────────────────────────────────────────────────────────────

/**
 * 获取验收整体状态。
 *
 * 1. reconcile 同步队列最新状态
 * 2. done = 所有 item pass 且 demo pass
 */
export function getAcceptanceStatus(
  opts: GetAcceptanceStatusOptions,
): AcceptanceStatus {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const spec: AcceptanceSpec = opts.progress.spec_snapshot;

  // ── 1. Reconcile ───────────────────────────────────────────────
  const reconciled = reconcileAcceptanceProgress({
    progress: opts.progress,
    taskStatuses: opts.taskStatuses,
    spec,
    nowIso,
  });

  const progress = reconciled.progress;

  // ── 2. 判定整体完成 ────────────────────────────────────────────
  const allItemsPass = spec.items.every(
    (item) => progress.items[item.id] === "pass",
  );
  const demoPass = progress.demo === "pass";
  const done = allItemsPass && demoPass;

  return { done, progress };
}
