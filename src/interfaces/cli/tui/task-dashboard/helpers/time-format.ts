import type { TaskRecord } from "../../../../../domain/task.js";

function recordStr(t: TaskRecord, key: string): string {
  return String((t as Record<string, unknown>)[key] ?? "");
}

/** 相对时间简写（列宽友好） */
export function relativeShort(iso: string | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

/**
 * running/claimed：主表「since」列基准时间。
 * 须用 started_at / claimed_at（任务进入执行以来的 wall time）；
 * 若优先 heartbeat_at，会与 shell 默认 15s 心跳叠加，导致「since」每隔约 15s 被重置，易误解。
 */
export function livenessIso(t: TaskRecord): string | undefined {
  const st = String(t.status ?? "");
  if (st !== "running" && st !== "claimed") return undefined;
  const started = recordStr(t, "started_at").trim();
  if (started) return started;
  const claimed = recordStr(t, "claimed_at").trim();
  if (claimed) return claimed;
  const hb = recordStr(t, "heartbeat_at").trim();
  if (hb) return hb;
  return undefined;
}
