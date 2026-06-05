/**
 * Schedule 持久化 — 读写 .agent-farm/schedules.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

export type ScheduleEntry = {
  id: string;
  cron: string;
  wave: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
};

const SCHEDULES_FILE = ".agent-farm/schedules.json";

function resolvePath(cwd: string): string {
  return join(cwd, SCHEDULES_FILE);
}

export function loadSchedules(cwd: string): ScheduleEntry[] {
  const p = resolvePath(cwd);
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown) => e && typeof e === "object" && typeof (e as ScheduleEntry).id === "string",
    );
  } catch {
    return [];
  }
}

export function saveSchedules(cwd: string, entries: ScheduleEntry[]): void {
  const p = resolvePath(cwd);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export function addSchedule(cwd: string, entry: ScheduleEntry): void {
  const existing = loadSchedules(cwd);
  const idx = existing.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  saveSchedules(cwd, existing);
}

export function removeSchedule(cwd: string, id: string): boolean {
  const existing = loadSchedules(cwd);
  const idx = existing.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  existing.splice(idx, 1);
  saveSchedules(cwd, existing);
  return true;
}
