import { spawnSync } from "node:child_process";

export function hasBinary(bin: string): boolean {
  if (process.platform === "win32") {
    const probe = spawnSync("where", [bin], { stdio: "ignore" });
    if (probe.status === 0) return true;
    return spawnSync("where", [`${bin}.exe`], { stdio: "ignore" }).status === 0;
  }
  return spawnSync("bash", ["-lc", `command -v ${bin}`], { stdio: "ignore" }).status === 0;
}

export function detectExecutorPreset(): "opencode" | "codex" | "claude" | "none" {
  if (hasBinary("opencode")) return "opencode";
  if (hasBinary("codex")) return "codex";
  if (hasBinary("claude")) return "claude";
  return "none";
}
