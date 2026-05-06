import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { ShellRunOptions, ShellRunner } from "../../domain/ports/shell-runner.js";

function resolveShellArgv(command: string): [string, string[]] {
  if (process.platform === "win32") {
    const bashOk = spawnSync("bash", ["-lc", "exit 0"], { stdio: "ignore" });
    if (bashOk.status === 0) {
      return ["bash", ["-lc", command]];
    }
    const comspec = process.env.ComSpec ?? "cmd.exe";
    return [comspec, ["/d", "/s", "/c", command]];
  }
  return ["bash", ["-lc", command]];
}

/** Windows：Git Bash 的登录环境常缺 npm 全局目录，导致找不到 `opencode.cmd` 等 shim。 */
let npmGlobalBinCache: string | null | undefined;

function tryNpmGlobalBinDir(): string | null {
  if (npmGlobalBinCache !== undefined) return npmGlobalBinCache;
  npmGlobalBinCache = null;
  const r = spawnSync("npm", ["bin", "-g"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  if (r.status === 0) {
    const p = r.stdout.trim().replace(/\r?\n/g, "");
    if (p.length > 0 && existsSync(p)) npmGlobalBinCache = p;
  }
  return npmGlobalBinCache;
}

function windowsNpmShimDirs(): string[] {
  const out: string[] = [];
  const fromNpm = tryNpmGlobalBinDir();
  if (fromNpm) out.push(fromNpm);
  const appData = process.env.APPDATA;
  if (appData) {
    const roamingNpm = join(appData, "npm");
    if (existsSync(roamingNpm)) {
      const dup = out.some((x) => x.toLowerCase() === roamingNpm.toLowerCase());
      if (!dup) out.push(roamingNpm);
    }
  }
  return out;
}

function prependPathSegments(env: NodeJS.ProcessEnv, segments: string[]): NodeJS.ProcessEnv {
  if (segments.length === 0) return env;
  const sep = process.platform === "win32" ? ";" : ":";
  const pathKey =
    Object.keys(env).find((k) => k.toLowerCase() === "path") ?? (process.platform === "win32" ? "Path" : "PATH");
  const cur = String(env[pathKey] ?? process.env[pathKey] ?? process.env.Path ?? process.env.PATH ?? "");
  const merged = [...segments, ...cur.split(sep)]
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of merged) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(p);
  }
  const next = deduped.join(sep);
  return { ...env, Path: next, PATH: next };
}

/** Git Bash 子进程：补齐与 cmd/PowerShell 一致的 npm 全局 PATH（仅 win32）。 */
function envForSpawn(shellBin: string, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.platform !== "win32" || shellBin !== "bash") return base;
  const extra = windowsNpmShimDirs();
  if (extra.length === 0) return base;
  return prependPathSegments(base, extra);
}

/** 基础设施适配器：子进程执行 */
export async function runShellCommand(
  command: string,
  options: ShellRunOptions = {}
): Promise<{ exitCode: number; output: string }> {
  const { onHeartbeat, heartbeatMs = 15000, env } = options;
  const [shellBin, shellArgs] = resolveShellArgv(command);
  const childEnv = envForSpawn(shellBin, env ?? { ...process.env });
  return await new Promise((resolve) => {
    const child = spawn(shellBin, shellArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv,
    });
    let output = "";
    let timer: NodeJS.Timeout | null = null;
    if (onHeartbeat) {
      timer = setInterval(() => {
        void onHeartbeat().catch(() => {
          // Best-effort heartbeat
        });
      }, heartbeatMs);
    }
    child.stdout.on("data", (d: Buffer) => {
      output += String(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      output += String(d);
    });
    child.on("close", (code: number | null) => {
      if (timer) clearInterval(timer);
      resolve({ exitCode: code ?? 1, output });
    });
  });
}

export const defaultShellRunner: ShellRunner = runShellCommand;
