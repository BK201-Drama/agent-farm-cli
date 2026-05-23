import type { TaskRecord } from "../../../../../domain/task.js";

/**
 * 轮询去重：只用业务语义字段，勿含 heartbeat_at / 各类时间戳（否则频繁 setState → Ink 在 IDE 终端里整屏堆叠）。
 */
function rowSig(t: TaskRecord): string {
  const r = t as Record<string, unknown>;
  const p = String(t.prompt ?? "").slice(0, 80);
  const topic = String(t.topic ?? "");
  const dedupe = String(t.dedupe_key ?? "");
  const mode = String(t.mode ?? "");
  const pri = r.priority !== undefined && r.priority !== null ? String(r.priority) : "";
  const err = String(r.last_error ?? r.blocked_reason ?? "");
  const attempt = r.attempt !== undefined && r.attempt !== null ? String(r.attempt) : "";
  let exit = "";
  const res = r.result;
  if (res && typeof res === "object") {
    const ex = (res as Record<string, unknown>).exit_code;
    exit = ex !== undefined && ex !== null ? String(ex) : "";
  }
  return `${String(t.task_id)}:${String(t.status)}:${mode}:${dedupe}:${pri}:${topic}:${p}:${err.slice(0, 80)}:${attempt}:${exit}`;
}

/** 用于轮询后跳过无意义的 setState */
export function tasksFingerprint(rows: TaskRecord[]): string {
  return [...rows].map(rowSig).sort().join("\n");
}
