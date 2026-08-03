import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { ShellRunOptions, ShellRunner } from "../../domain/ports/shell-runner.js";

/** 与 `AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS` 类似：未设置则无上限；有则限制在合理区间 */
const SHELL_TIMEOUT_MIN_MS = 3000;
const SHELL_TIMEOUT_MAX_MS = 172_800_000; // 48h

/**
 * 解析 `AGENT_FARM_SHELL_TIMEOUT_MS`；未设置或非正数返回 `undefined`（不启用超时）。
 */
export function resolveShellTimeoutMsFromEnv(): number | undefined {
  const n = Number(process.env.AGENT_FARM_SHELL_TIMEOUT_MS);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.max(n, SHELL_TIMEOUT_MIN_MS), SHELL_TIMEOUT_MAX_MS);
}

function resolveShellTimeoutMs(options: ShellRunOptions): number | undefined {
  if (options.timeoutMs !== undefined) {
    const n = Number(options.timeoutMs);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    /** 单测等可传较短值；CLI/环境变量路径仍用 {@link SHELL_TIMEOUT_MIN_MS} */
    return Math.min(Math.max(n, 100), SHELL_TIMEOUT_MAX_MS);
  }
  return resolveShellTimeoutMsFromEnv();
}

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
  const merged = [...segments, ...cur.split(sep)].map((s) => s.trim()).filter(Boolean);
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

function toMsysPath(winPath: string): string {
  const normalized = winPath.replace(/\\/g, "/");
  const m = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (m) return `/${m[1].toLowerCase()}/${m[2]}`;
  return normalized;
}

function windowsCursorAgentBinDirs(forBash: boolean): string[] {
  const out: string[] = [];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const dir = join(local, "cursor-agent");
    if (existsSync(dir)) out.push(forBash ? toMsysPath(dir) : dir);
  }
  return out;
}

/** Git Bash 子进程：补齐 npm 全局 PATH + Cursor Agent CLI 目录（MSYS 路径）。 */
function envForSpawn(shellBin: string, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.platform !== "win32" || shellBin !== "bash") return base;
  const cursorDirs = windowsCursorAgentBinDirs(true);
  const npmDirs = windowsNpmShimDirs().map(toMsysPath);
  const extra = [...cursorDirs, ...npmDirs];
  if (extra.length === 0) return base;
  // bash 期望 ':' 分隔；保留原 PATH（Git Bash 会转换）并把 MSYS 段前置
  const pathKey =
    Object.keys(base).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const cur = String(base[pathKey] ?? process.env[pathKey] ?? "");
  const prefix = extra.join(":");
  const next = cur ? `${prefix}:${cur}` : prefix;
  return { ...base, Path: next, PATH: next };
}

/** 基础设施适配器：子进程执行 */
export async function runShellCommand(
  command: string,
  options: ShellRunOptions = {},
): Promise<{ exitCode: number; output: string }> {
  const { onHeartbeat, heartbeatMs = 15000, env, onStdoutLine, onStderrLine, shouldAbort } = options;
  const timeoutMs = resolveShellTimeoutMs(options);
  const [shellBin, shellArgs] = resolveShellArgv(command);
  const childEnv = envForSpawn(shellBin, env ?? { ...process.env });
  return await new Promise((resolve) => {
    const child = spawn(shellBin, shellArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv,
    });
    let output = "";
    let stdoutBuf = "";
    let stderrBuf = "";
    let settled = false;
    let shellKilledByTimeout = false;
    let shellKilledByAbort = false;
    let timer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;

    const killChild = (): void => {
      if (process.platform === "win32" && child.pid != null) {
        try {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } catch {
          console.error(`[agent-farm] taskkill failed for PID ${child.pid}, falling back to child.kill()`);
          try {
            child.kill();
          } catch {
            console.error(`[agent-farm] child.kill() failed for PID ${child.pid}`);
          }
        }
      } else {
        try {
          child.kill();
        } catch {
          console.error(`[agent-farm] child.kill() failed for PID ${child.pid}`);
        }
      }
    };

    const finish = (exitCode: number, out: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve({ exitCode, output: out });
    };
    if (onHeartbeat || shouldAbort) {
      timer = setInterval(() => {
        void (async () => {
          if (settled) return;
          if (onHeartbeat) {
            await onHeartbeat().catch(() => {
              // Best-effort heartbeat
            });
          }
          if (shouldAbort && !settled) {
            const abort = await shouldAbort().catch(() => false);
            if (abort && !settled) {
              shellKilledByAbort = true;
              killChild();
            }
          }
        })();
      }, heartbeatMs);
    }
    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        shellKilledByTimeout = true;
        killChild();
      }, timeoutMs);
    }
    child.stdout.on("data", (d: Buffer) => {
      const chunk = String(d);
      output += chunk;
      if (onStdoutLine) {
        stdoutBuf += chunk;
        const parts = stdoutBuf.split("\n");
        stdoutBuf = parts.pop() ?? "";
        for (const line of parts) {
          if (line.length > 0) onStdoutLine(line);
        }
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      const chunk = String(d);
      output += chunk;
      if (onStderrLine) {
        stderrBuf += chunk;
        const parts = stderrBuf.split("\n");
        stderrBuf = parts.pop() ?? "";
        for (const line of parts) {
          if (line.length > 0) onStderrLine(line);
        }
      }
    });
    child.on("close", (code: number | null) => {
      if (timer) clearInterval(timer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (onStdoutLine && stdoutBuf.trim().length > 0) {
        onStdoutLine(stdoutBuf.trimEnd());
      }
      if (onStderrLine && stderrBuf.trim().length > 0) {
        onStderrLine(stderrBuf.trimEnd());
      }
      let exitCode = code ?? 1;
      let combined = output;
      if (shellKilledByTimeout) {
        combined += `\n[agent-farm] shell exceeded ${timeoutMs}ms (SIGTERM/kill)\n`;
        exitCode = 124;
      }
      if (shellKilledByAbort) {
        combined += `\n[agent-farm] empty-run abort\n`;
        exitCode = 125;
      }
      finish(exitCode, combined);
    });
  });
}

export const defaultShellRunner: ShellRunner = runShellCommand;
