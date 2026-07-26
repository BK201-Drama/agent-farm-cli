import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

export function writePidFile(filePath: string, pid: number): void {
  writeFileSync(filePath, String(pid), "utf8");
}

export function readPidFile(filePath: string): number | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    // Check if process is alive
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return null; // process dead
    }
  } catch {
    return null;
  }
}

export function deletePidFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // already gone — no-op
  }
}
