/**
 * Spec Acceptance Runtime — 进度持久化
 *
 * 提供进度文件的读写及初始化，不负责状态机转换逻辑。
 * 应用层通过 `acceptanceProgressPath` / `initProgressFromSpec` /
 * `readProgress` / `writeProgress` 调用。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  AcceptanceItemState,
  AcceptanceProgress,
  AcceptanceSpec,
} from "./types.js";

// ── 路径 ──────────────────────────────────────────────────────────────

/**
 * 给定 farm root 和 poc_id，返回进度文件路径。
 * 例：`{farmRoot}/.agent-farm/acceptance/{pocId}.json`
 */
export function acceptanceProgressPath(
  farmRoot: string,
  pocId: string,
): string {
  return path.join(farmRoot, ".agent-farm", "acceptance", `${pocId}.json`);
}

// ── 初始化 ────────────────────────────────────────────────────────────

/**
 * 从 spec 生成初始进度快照。
 *
 * - 没有未满足依赖的 item → `"pending"`
 * - 有未满足依赖的 item → `"blocked"`
 * - demo → `"locked"`（需显式解锁）
 */
export function initProgressFromSpec(
  spec: AcceptanceSpec,
  nowIso: string,
): AcceptanceProgress {
  const itemIds = new Set(spec.items.map((i) => i.id));

  const items: Record<string, AcceptanceItemState> = {};
  for (const item of spec.items) {
    const hasUnmetDep = item.depends_on.some((depId) => !itemIds.has(depId));
    // 规范已保证 depends_on 引用的 id 都存在，但这里依然防御。
    if (item.depends_on.length === 0 || hasUnmetDep) {
      if (hasUnmetDep) {
        // 实际不应出现（spec 校验已拦截），降级为 pending 而非 blocked
        items[item.id] = "pending";
      } else {
        items[item.id] = "pending";
      }
    } else {
      items[item.id] = "blocked";
    }
  }

  return {
    poc_id: spec.poc_id,
    code_root: spec.code_root,
    updated_at: nowIso,
    items,
    demo: "locked",
    spec_snapshot: structuredClone(spec),
  };
}

// ── 读写 ──────────────────────────────────────────────────────────────

/**
 * 读取进度文件。
 * 文件不存在或内容非法时返回 `null`。
 */
export async function readProgress(
  filePath: string,
): Promise<AcceptanceProgress | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data: unknown = JSON.parse(raw);
    // 基本结构校验：必须有 poc_id / items / demo / spec_snapshot
    if (
      data !== null &&
      typeof data === "object" &&
      "poc_id" in data &&
      "items" in data &&
      "demo" in data &&
      "spec_snapshot" in data
    ) {
      return data as AcceptanceProgress;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 写入进度文件，必要时递归创建父目录。
 */
export async function writeProgress(
  filePath: string,
  progress: AcceptanceProgress,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(progress, null, 2) + "\n", "utf-8");
}
