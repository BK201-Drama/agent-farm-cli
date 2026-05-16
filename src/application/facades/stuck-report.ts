import type { JsonMap, TaskRecord } from "../../domain/task.js";

export type StuckSuggestedAction =
  | "retry"
  | "recover_stale"
  | "resolve_dedupe"
  | "review"
  | "inspect";

export type StuckItem = {
  kind: string;
  severity: "high" | "medium";
  task_id?: string;
  dedupe_key?: string;
  summary: string;
  suggested_action: StuckSuggestedAction;
  suggested_command?: string;
  meta?: JsonMap;
};

export type StuckReport = {
  ok: boolean;
  items: StuckItem[];
  retryable_count: number;
  high_severity_count: number;
};

function cmdRetry(taskId: string): string {
  return `agent-farm stuck retry --task-id ${taskId}`;
}

/** 将 doctor.build() 结果转为可操作的 stuck 条目（面向人 + CLI）。 */
export function buildStuckReport(doctor: JsonMap): StuckReport {
  const items: StuckItem[] = [];

  const stale = (doctor.stale_running as Array<{ task_id: string; age_seconds: number }> | undefined) ?? [];
  for (const s of stale) {
    const id = String(s.task_id);
    items.push({
      kind: "stale_running",
      severity: "high",
      task_id: id,
      summary: `running 超租约 ${s.age_seconds}s，worker 可能已死`,
      suggested_action: "retry",
      suggested_command: cmdRetry(id),
      meta: { age_seconds: s.age_seconds },
    });
  }

  const hb =
    (doctor.heartbeat_missing as Array<{ task_id: string; heartbeat_at: string }> | undefined) ?? [];
  for (const h of hb) {
    const id = String(h.task_id);
    items.push({
      kind: "heartbeat_missing",
      severity: "high",
      task_id: id,
      summary: `有心跳无 claim（claimed_by 为空）`,
      suggested_action: "retry",
      suggested_command: cmdRetry(id),
      meta: { heartbeat_at: h.heartbeat_at },
    });
  }

  const dedupe =
    (doctor.duplicate_dedupe_keys as Array<{ dedupe_key: string; task_ids: string[] }> | undefined) ??
    [];
  for (const d of dedupe) {
    items.push({
      kind: "duplicate_dedupe",
      severity: "high",
      dedupe_key: d.dedupe_key,
      summary: `dedupe_key 碰撞：${d.task_ids.length} 条活跃任务`,
      suggested_action: "resolve_dedupe",
      suggested_command: `agent-farm queue list --status running,queued,retry,claimed,review`,
      meta: { task_ids: d.task_ids },
    });
  }

  const reviewOd =
    (doctor.review_overdue as Array<{ task_id: string; age_hours: number }> | undefined) ?? [];
  for (const r of reviewOd) {
    const id = String(r.task_id);
    items.push({
      kind: "review_overdue",
      severity: "medium",
      task_id: id,
      summary: `review 停留 ${r.age_hours}h，待人工处理`,
      suggested_action: "review",
      suggested_command: `agent-farm dashboard`,
      meta: { age_hours: r.age_hours },
    });
  }

  const hotspots = (doctor.failure_hotspots as Array<{ reason: string; count: number }> | undefined) ?? [];
  if (hotspots.length > 0 && hotspots[0]!.count > 0) {
    items.push({
      kind: "failure_hotspot",
      severity: "medium",
      summary: `失败热点：${hotspots[0]!.reason.slice(0, 80)}（×${hotspots[0]!.count}）`,
      suggested_action: "inspect",
      suggested_command: "agent-farm stuck list",
      meta: { hotspots: hotspots.slice(0, 3) },
    });
  }

  const retryable_count = items.filter((i) => i.suggested_action === "retry").length;
  const high_severity_count = items.filter((i) => i.severity === "high").length;

  return {
    ok: doctor.ok !== false,
    items,
    retryable_count,
    high_severity_count,
  };
}

export function formatStuckBrief(report: StuckReport): string[] {
  if (report.items.length === 0) {
    return ["stuck: 未发现需介入项（仍可用 doctor / dashboard 巡检）"];
  }
  const lines = [
    `stuck: ${report.items.length} 项（高优先级 ${report.high_severity_count}，可 retry ${report.retryable_count}）`,
  ];
  for (const item of report.items.slice(0, 12)) {
    const id = item.task_id ? `[${item.task_id}] ` : "";
    lines.push(`  ${item.severity === "high" ? "!" : "·"} ${id}${item.summary}`);
    if (item.suggested_command) {
      lines.push(`    → ${item.suggested_command}`);
    }
  }
  if (report.items.length > 12) {
    lines.push(`  … 另有 ${report.items.length - 12} 项，见 stuck list JSON`);
  }
  return lines;
}

/** Dashboard 顶栏：stale + heartbeat 计数（与 doctor 阈值一致时需传入 lease）。 */
export function stuckRiskBadgeFromDoctor(doctor: JsonMap): string {
  const n =
    Number(doctor.stale_running_count ?? 0) + Number(doctor.heartbeat_missing_count ?? 0);
  if (n <= 0) return "";
  return `⚠stuck:${n}`;
}

/** Dashboard 轮询：不跑 doctor 时从任务快照估算 stuck 数。 */
export function stuckRiskBadgeFromTasks(tasks: TaskRecord[], leaseTimeoutSeconds: number): string {
  const now = Date.now();
  let n = 0;
  for (const t of tasks) {
    if (String(t.status) === "running") {
      const ts = Date.parse(String(t.heartbeat_at ?? t.started_at ?? ""));
      if (!Number.isNaN(ts) && (now - ts) / 1000 >= leaseTimeoutSeconds) n++;
    }
    if (t.heartbeat_at != null && t.claimed_by == null) n++;
  }
  return n > 0 ? `⚠stuck:${n}` : "";
}
