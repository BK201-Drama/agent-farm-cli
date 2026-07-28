/**
 * Spec Acceptance Runtime — 任务 ID / dedupe_key 约定
 *
 * Windows 下 path.mkdir 不能使用 `:`，故不用 `acceptance:poc:item`，
 * 统一为 `acceptance__{poc_id}__{item_id}`。
 */

/** 去掉路径不安全字符，保留可读 id */
export function sanitizeAcceptanceIdPart(raw: string): string {
  return String(raw)
    .trim()
    .replace(/[:/\\]/g, "-")
    .replace(/\s+/g, "-");
}

/** 单条验收任务的 task_id / dedupe_key */
export function acceptanceTaskKey(pocId: string, itemId: string): string {
  return `acceptance__${sanitizeAcceptanceIdPart(pocId)}__${sanitizeAcceptanceIdPart(itemId)}`;
}

/** 匹配某 POC 下全部验收任务的前缀 */
export function acceptanceTaskKeyPrefix(pocId: string): string {
  return `acceptance__${sanitizeAcceptanceIdPart(pocId)}__`;
}
