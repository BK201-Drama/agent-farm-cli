import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EventRecord } from "../../domain/event.js";
import type { JsonMap } from "../../domain/task.js";
import type { ExecuteStageReport } from "../worker/execute-stage-report.js";

export type TimelineEntry = {
  ts: string;
  kind: "event" | "execute_report";
  label: string;
  detail: JsonMap;
};

export function readExecuteReportsForTask(runsDir: string, taskId: string): ExecuteStageReport[] {
  const dir = join(runsDir, taskId);
  if (!existsSync(dir)) return [];
  const out: ExecuteStageReport[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.startsWith("execute-") || !name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), "utf8")) as ExecuteStageReport);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

/** 合并任务事件与 execute 报告，按 ts 排序（replay 用）。 */
export function buildTaskTimeline(
  taskId: string,
  events: EventRecord[],
  executeReports: ExecuteStageReport[],
): TimelineEntry[] {
  const key = String(taskId);
  const entries: TimelineEntry[] = [];

  for (const e of events) {
    if (String(e.task_id ?? "") !== key) continue;
    entries.push({
      ts: String(e.ts ?? ""),
      kind: "event",
      label: String(e.event ?? "unknown"),
      detail: e as JsonMap,
    });
  }

  for (const r of executeReports) {
    entries.push({
      ts: r.finished_at,
      kind: "execute_report",
      label: `execute#${r.attempt} exit=${r.exit_code} bytes=${r.output_bytes}`,
      detail: r as unknown as JsonMap,
    });
  }

  entries.sort((a, b) => a.ts.localeCompare(b.ts));
  return entries;
}
