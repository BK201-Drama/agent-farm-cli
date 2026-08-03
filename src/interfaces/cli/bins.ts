import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function hasBinary(bin: string): boolean {
  if (process.platform === "win32") {
    const probe = spawnSync("where", [bin], { stdio: "ignore" });
    if (probe.status === 0) return true;
    if (spawnSync("where", [`${bin}.exe`], { stdio: "ignore" }).status === 0) return true;
    if (spawnSync("where", [`${bin}.cmd`], { stdio: "ignore" }).status === 0) return true;
    // Cursor Agent CLI 默认安装目录
    if (bin === "agent" || bin === "cursor-agent") {
      const local = process.env.LOCALAPPDATA;
      if (local && existsSync(join(local, "cursor-agent", "agent.cmd"))) return true;
    }
    return false;
  }
  return spawnSync("bash", ["-lc", `command -v ${bin}`], { stdio: "ignore" }).status === 0;
}

export type DetectedExecutorPreset = "opencode" | "codex" | "claude" | "cursor-agent" | "none";

export function detectExecutorPreset(): DetectedExecutorPreset {
  if (hasBinary("opencode") || hasBinary("opencode-ai")) return "opencode";
  if (hasBinary("codex")) return "codex";
  if (hasBinary("agent") || hasBinary("cursor-agent")) return "cursor-agent";
  if (hasBinary("claude")) return "claude";
  return "none";
}
