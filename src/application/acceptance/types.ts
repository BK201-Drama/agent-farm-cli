/**
 * Spec Acceptance Runtime — 领域类型
 *
 * 与 `schemas/acceptance.schema.json` 及 `parseAcceptanceSpecJson` 对齐。
 * 应用层可继续 `import { AcceptanceSpec } from "../acceptance/types.js"`。
 */

/** 单条机器可验证的验收项 */
export interface AcceptanceItemSpec {
  id: string;
  title: string;
  /** 验证命令；needs_human === true 时可为 null */
  verify: string | null;
  /** 需要人工判断时置 true，此时 verify 可为 null */
  needs_human: boolean;
  /** 依赖的其他 item id，必须在 items 中存在 */
  depends_on: string[];
}

/** Demo 验收定义 */
export interface AcceptanceDemoSpec {
  id: string;
  /** 可选：如何演示的说明 */
  how?: string;
  /** 验证命令（必填） */
  verify: string;
}

/** 一个 POC 的完整验收规格 */
export interface AcceptanceSpec {
  poc_id: string;
  code_root: string;
  demo: AcceptanceDemoSpec;
  items: AcceptanceItemSpec[];
}

/** 单条验收项的运行时状态 */
export type AcceptanceItemState =
  | "pending"
  | "blocked"
  | "running"
  | "verifying"
  | "awaiting_human"
  | "pass"
  | "fail";

/** Demo 验收的运行时状态 */
export type AcceptanceDemoState =
  | "locked"
  | "ready"
  | "running"
  | "pass"
  | "fail";

/** 运行时进度快照，由 AcceptanceRuntime 写入 */
export interface AcceptanceProgress {
  poc_id: string;
  code_root: string;
  /** ISO-8601 */
  updated_at: string;
  /** item id → 当前状态 */
  items: Record<string, AcceptanceItemState>;
  demo: AcceptanceDemoState;
  /** 解析时的原始 spec，用于对比是否过期 */
  spec_snapshot: AcceptanceSpec;
}
