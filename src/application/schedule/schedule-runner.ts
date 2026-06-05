/**
 * Schedule runner — 检查到期 schedule，派活到队列
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { ScheduleEntry } from "./schedule-store.js";
import { loadSchedules, saveSchedules } from "./schedule-store.js";
import { cronMatchesAt, nextCronMatch } from "./cron-matcher.js";
import { parseCron } from "./cron-matcher.js";
import { existsSync } from "node:fs";

export type ScheduleRunResult = {
  id: string;
  ran: boolean;
  wave: string;
  error?: string;
};

function findAgentFarmBin(cwd: string): string {
  const distCli = join(cwd, "dist", "interfaces", "cli", "index.js");
  if (existsSync(distCli)) return distCli;
  const tsx = join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  if (existsSync(tsx)) return join(cwd, "src", "interfaces", "cli", "index.ts");
  return distCli; // fallback
}

function dispatchWave(cwd: string, wavePath: string): { ok: boolean; error?: string } {
  const fullWavePath = join(cwd, wavePath);
  if (!existsSync(fullWavePath)) {
    return { ok: false, error: `wave file not found: ${fullWavePath}` };
  }

  // Use the enqueue-task-wave script to dispatch
  const enqueueScript = join(cwd, "scripts", "enqueue-task-wave.mjs");
  const nodeBin = process.execPath;

  try {
    const r = spawnSync(nodeBin, [enqueueScript, fullWavePath], {
      cwd,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env },
    });
    if (r.status !== 0) {
      return { ok: false, error: (r.stderr || r.stdout || "unknown error").slice(0, 500) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function runDueSchedules(cwd: string, now: Date = new Date()): ScheduleRunResult[] {
  const entries = loadSchedules(cwd);
  const results: ScheduleRunResult[] = [];
  const updated: ScheduleEntry[] = [];

  for (const entry of entries) {
    if (!entry.enabled) {
      updated.push(entry);
      continue;
    }
    try {
      const expr = parseCron(entry.cron);
      if (cronMatchesAt(expr, now)) {
        // Avoid double-fire within the same minute
        if (entry.last_run) {
          const lastRun = new Date(entry.last_run);
          if (lastRun.getTime() >= now.getTime() - 60_000) {
            updated.push(entry);
            results.push({ id: entry.id, ran: false, wave: entry.wave, error: "already ran within last minute" });
            continue;
          }
        }
        const dispatch = dispatchWave(cwd, entry.wave);
        const nextRun = nextCronMatch(expr, now);
        const updated_entry: ScheduleEntry = {
          ...entry,
          last_run: now.toISOString(),
          next_run: nextRun ? nextRun.toISOString() : null,
        };
        updated.push(updated_entry);
        results.push({
          id: entry.id,
          ran: dispatch.ok,
          wave: entry.wave,
          error: dispatch.error,
        });
      } else {
        // Update next_run prediction
        const nextRun = nextCronMatch(expr, now);
        updated.push({ ...entry, next_run: nextRun ? nextRun.toISOString() : null });
        results.push({ id: entry.id, ran: false, wave: entry.wave });
      }
    } catch (err) {
      updated.push(entry);
      results.push({
        id: entry.id,
        ran: false,
        wave: entry.wave,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  saveSchedules(cwd, updated);
  return results;
}
