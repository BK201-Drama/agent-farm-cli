import type { AgentFarmStorageKind } from "../../domain/task/queue-workspace-paths.js";
import type { BetterSqlite3Probe } from "../../infrastructure/diagnostics/better-sqlite3-probe.js";

/**
 * CI / cron 用：根据 doctor 合并报告与 sqlite 探针判断是否应非零退出。
 * 不包含 orphan worktrees（开发机常见噪声）；不包含 opencode 探针失败。
 */
export function collectDoctorCiFailReasons(
  merged: Record<string, unknown>,
  sqliteProbe: BetterSqlite3Probe,
  storage: AgentFarmStorageKind,
): string[] {
  const reasons: string[] = [];
  if (merged.ok === false) {
    reasons.push(`doctor report ok=false: ${merged.error ?? "unknown"}`);
  }
  const dedupe = Number(merged.duplicate_dedupe_keys_count ?? 0);
  if (dedupe > 0) {
    reasons.push(`duplicate dedupe_key collisions: ${dedupe}`);
  }
  const stale = Number(merged.stale_running_count ?? 0);
  if (stale > 0) {
    reasons.push(`stale running tasks: ${stale}`);
  }
  const hb = Number(merged.heartbeat_missing_count ?? 0);
  if (hb > 0) {
    reasons.push(`heartbeat missing (no claim): ${hb}`);
  }
  const reviewOd = Number(merged.review_overdue_count ?? 0);
  if (reviewOd > 0) {
    reasons.push(`review overdue: ${reviewOd}`);
  }
  if (storage === "sqlite" && !sqliteProbe.ok) {
    reasons.push(`sqlite probe failed: ${sqliteProbe.hint ?? "unknown"}`);
  }
  return reasons;
}
