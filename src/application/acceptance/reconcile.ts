/**
 * Spec Acceptance Runtime — 状态同步
 *
 * 根据队列中任务的实际状态更新验收进度，处理依赖解锁和 demo 就绪判定。
 * 应用层通过 `reconcileAcceptanceProgress(opts)` 调用。
 */
import { acceptanceTaskKey } from "./acceptance-task-key.js";
import type {
  AcceptanceDemoState,
  AcceptanceItemSpec,
  AcceptanceItemState,
  AcceptanceProgress,
  AcceptanceSpec,
} from "./types.js";

// ── 类型 ──────────────────────────────────────────────────────────────

export interface ReconcileChange {
  itemId: string;
  from: AcceptanceItemState;
  to: AcceptanceItemState;
}

export interface ReconcileOptions {
  /** 当前进度快照 */
  progress: AcceptanceProgress;
  /** dedupe_key → task status（来自队列查询） */
  taskStatuses: Map<string, string>;
  /** 原始 spec，用于查找 needs_human / depends_on 等元数据 */
  spec: AcceptanceSpec;
  /** 当前时间 ISO 字符串 */
  nowIso: string;
}

export interface ReconcileResult {
  /** 更新后的进度（含 updated_at / items / demo） */
  progress: AcceptanceProgress;
  /** 本次被解锁（blocked → pending）的 item，调用方应入队 */
  newlyUnblocked: AcceptanceItemSpec[];
  /** demo 是否刚变为 ready */
  demoReady: boolean;
  /** 所有状态变更记录 */
  changes: ReconcileChange[];
}

// ── helpers ────────────────────────────────────────────────────────────

/**
 * 将队列 task status 映射为验收 item state。
 * 返回 null 表示此状态不需要更新 item（如 claimed / queued 保持现状）。
 */
function taskStatusToItemState(
  taskStatus: string,
  needsHuman: boolean,
): AcceptanceItemState | null {
  switch (taskStatus) {
    case "done":
    case "approved":
      return "pass";
    case "review":
      return needsHuman ? "awaiting_human" : null;
    case "running":
      return "running";
    case "failed":
      return "fail";
    case "retry":
      return "pending";
    default:
      return null; // queued / claimed / blocked / cancelled 等不影响验收状态
  }
}

// ── 主函数 ────────────────────────────────────────────────────────────

/**
 * 根据队列中任务的实际状态同步验收进度。
 *
 * 流程：
 * 1. 遍历每个 item，用 dedupe_key 匹配队列任务状态
 * 2. 按规则更新 item state
 * 3. 检测被解锁的 blocked item（其所有依赖均已 pass）
 * 4. 若所有 item pass → demo ready
 */
export function reconcileAcceptanceProgress(
  opts: ReconcileOptions,
): ReconcileResult {
  const { progress, taskStatuses, spec, nowIso } = opts;
  const items = { ...progress.items };
  const changes: ReconcileChange[] = [];

  // ── 1. 逐 item 同步队列状态 ─────────────────────────────────
  for (const item of spec.items) {
    const key = acceptanceTaskKey(spec.poc_id, item.id);
    const taskStatus = taskStatuses.get(key);
    if (!taskStatus) continue; // 未找到对应任务，跳过

    const current = items[item.id];
    const next = taskStatusToItemState(taskStatus, item.needs_human);
    if (next !== null && next !== current) {
      changes.push({ itemId: item.id, from: current, to: next });
      items[item.id] = next;
    }
  }

  // ── 2. 解锁 blocked item（其所有依赖均已 pass）───────────────
  const newlyUnblocked: AcceptanceItemSpec[] = [];
  for (const item of spec.items) {
    if (items[item.id] !== "blocked") continue;
    const allDepsPass = item.depends_on.length > 0 &&
      item.depends_on.every((depId) => items[depId] === "pass");
    if (allDepsPass) {
      changes.push({ itemId: item.id, from: "blocked", to: "pending" });
      items[item.id] = "pending";
      newlyUnblocked.push(item);
    }
  }

  // ── 3. 判定 demo 就绪 ───────────────────────────────────────
  const allItemsPass = spec.items.every((item) => items[item.id] === "pass");
  let demo: AcceptanceDemoState = progress.demo;
  let demoReady = false;
  if (allItemsPass && demo === "locked") {
    demo = "ready";
    demoReady = true;
  }

  const result: ReconcileResult = {
    progress: {
      ...progress,
      items,
      demo,
      updated_at: nowIso,
    },
    newlyUnblocked,
    demoReady,
    changes,
  };

  return result;
}
