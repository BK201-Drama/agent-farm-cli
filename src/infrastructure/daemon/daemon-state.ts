import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

export type DaemonState = {
  startedAt: string; // ISO 8601
  workers: number;
  status: "running";
  lastHeartbeat: string; // ISO 8601, updated periodically
};

export function writeDaemonState(filePath: string, state: DaemonState): void {
  writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

export function readDaemonState(filePath: string): DaemonState | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as DaemonState;
    if (!parsed.startedAt || !parsed.status) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteDaemonState(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // already gone
  }
}

export function daemonStatePath(workspace: string): string {
  return join(workspace, ".agent-farm", "daemon-state.json");
}

export function daemonPidPath(workspace: string): string {
  return join(workspace, ".agent-farm", "daemon.pid");
}
