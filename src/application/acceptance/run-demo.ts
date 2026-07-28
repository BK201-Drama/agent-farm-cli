/**
 * Spec Acceptance Runtime — Demo 验收执行
 *
 * reconcile 同步最新状态 → 校验所有 item 均已 pass →
 * 运行 demo.verify 命令 → 更新 demo 状态。
 * 应用层通过 `runDemo(opts)` 调用。
 */
import * as path from "node:path";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import { runAcceptanceCheck } from "../worker/acceptance-check.js";
import { reconcileAcceptanceProgress } from "./reconcile.js";
import type { AcceptanceProgress, AcceptanceSpec } from "./types.js";

// ── 类型 ──────────────────────────────────────────────────────────────

export interface RunDemoOptions {
  /** 当前进度快照 */
  progress: AcceptanceProgress;
  /** dedupe_key → task status（来自队列查询） */
  taskStatuses: Map<string, string>;
  /** farm root，用于解析相对 code_root */
  farmRoot: string;
  /** shell 执行器 */
  runShell: ShellRunner;
  /** 当前时间 ISO 字符串（默认 now） */
  nowIso?: string;
  /** 命令超时（毫秒），默认 120_000 */
  timeoutMs?: number;
}

export interface RunDemoResult {
  passed: boolean;
  output: string;
  progress: AcceptanceProgress;
}

// ── 错误类型 ──────────────────────────────────────────────────────────

/**
 * 当存在未 pass 的 item 时抛出，阻止 demo 执行。
 * `failingItemIds` 列出所有状态不是 `"pass"` 的 item id。
 */
export class DemoBlockedError extends Error {
  public readonly failingItemIds: string[];

  constructor(failingItemIds: string[]) {
    super(
      `Demo cannot run: ${failingItemIds.length} item(s) not passing — ${failingItemIds.join(", ")}`,
    );
    this.name = "DemoBlockedError";
    this.failingItemIds = failingItemIds;
  }
}

// ── 实现 ──────────────────────────────────────────────────────────────

/**
 * 执行 demo 验收。
 *
 * 流程：
 * 1. reconcile 同步队列最新状态
 * 2. 校验所有 item 均已 pass（否则抛出 DemoBlockedError）
 * 3. demo → running
 * 4. 在 code_root 下运行 demo.verify 命令
 * 5. exit 0 → pass，否则 → fail
 */
export async function runDemo(
  opts: RunDemoOptions,
): Promise<RunDemoResult> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const spec: AcceptanceSpec = opts.progress.spec_snapshot;

  // ── 1. Reconcile ───────────────────────────────────────────────
  const reconciled = reconcileAcceptanceProgress({
    progress: opts.progress,
    taskStatuses: opts.taskStatuses,
    spec,
    nowIso,
  });

  let progress = reconciled.progress;

  // ── 2. 校验所有 item pass ──────────────────────────────────────
  const failingIds = spec.items
    .filter((item) => progress.items[item.id] !== "pass")
    .map((item) => item.id);

  if (failingIds.length > 0) {
    throw new DemoBlockedError(failingIds);
  }

  // ── 3. demo → running ──────────────────────────────────────────
  progress = {
    ...progress,
    demo: "running",
    updated_at: nowIso,
  };

  // ── 4. 解析 cwd ────────────────────────────────────────────────
  const cwd = path.isAbsolute(spec.code_root)
    ? spec.code_root
    : path.resolve(opts.farmRoot, spec.code_root);

  // ── 5. 运行 demo 验证 ──────────────────────────────────────────
  const { passed, output } = await runAcceptanceCheck(spec.demo.verify, {
    cwd,
    env: process.env,
    runShell: opts.runShell,
    timeoutMs: opts.timeoutMs,
  });

  // ── 6. 更新 demo 最终状态 ──────────────────────────────────────
  progress = {
    ...progress,
    demo: passed ? "pass" : "fail",
    updated_at: new Date().toISOString(),
  };

  return { passed, output, progress };
}
