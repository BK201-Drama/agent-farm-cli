import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  commandLooksLikeOpencodeRun,
  commandLooksLikeClaudeRun,
  commandLooksLikeCodexRun,
  commandLooksLikeCursorAgentRun,
} from "../executors/opencode-shell-runner.js";

export type ExecutorHealthStatus = {
  healthy: boolean;
  reason: string;
  probe_command?: string;
  probe_output?: string;
  executor_id: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export function isExecutorProbeSkippedByEnv(): boolean {
  const v = String(process.env.AGENT_FARM_SKIP_EXECUTOR_PROBE ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 从 executor ID 和 command template 反推需要探测的 agent 二进制名。返回 null 表示无需探测（纯 shell）。 */
export function resolveProbeBinary(executorId: string, commandTemplate: string): string | null {
  const id = executorId.toLowerCase().replace(/_/g, "-");
  if (id === "cursor-sdk") {
    return "cursor-sdk";
  }
  if (id === "cursor-agent" || id === "agent") {
    return "agent";
  }
  if (id === "codex") {
    return "codex";
  }
  if (commandLooksLikeOpencodeRun(commandTemplate)) {
    return "opencode-ai";
  }
  if (commandLooksLikeClaudeRun(commandTemplate)) {
    return "claude";
  }
  if (commandLooksLikeCodexRun(commandTemplate)) {
    return "codex";
  }
  if (commandLooksLikeCursorAgentRun(commandTemplate)) {
    return "agent";
  }
  return null;
}

/** 判断 command template 是否为纯 shell（不含已知 agent CLI 语法），可作为降级回退。 */
export function commandTemplateIsShellFallback(commandTemplate: string): boolean {
  const tpl = commandTemplate.trim();
  if (!tpl) return false;
  return (
    !commandLooksLikeOpencodeRun(tpl) &&
    !commandLooksLikeClaudeRun(tpl) &&
    !commandLooksLikeCodexRun(tpl) &&
    !commandLooksLikeCursorAgentRun(tpl)
  );
}

function probeWhichBinary(binary: string, timeoutMs: number): { ok: boolean; output: string; probeCmd: string } {
  const probeCmd = process.platform === "win32" ? `where ${binary}` : `command -v ${binary}`;
  const r =
    process.platform === "win32"
      ? spawnSync("where", [binary], { encoding: "utf8", windowsHide: true, timeout: timeoutMs })
      : spawnSync("bash", ["-lc", `command -v ${binary}`], { encoding: "utf8", timeout: timeoutMs });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0 && Boolean(output), output, probeCmd };
}

export async function checkExecutorHealth(
  executorId: string,
  commandTemplate: string,
  opts?: { timeoutMs?: number; workspaceRoot?: string },
): Promise<ExecutorHealthStatus> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const workspaceRoot = opts?.workspaceRoot ?? process.cwd();

  if (isExecutorProbeSkippedByEnv()) {
    return { healthy: true, reason: "skipped (AGENT_FARM_SKIP_EXECUTOR_PROBE)", executor_id: executorId };
  }

  const binary = resolveProbeBinary(executorId, commandTemplate);

  if (binary === null) {
    return { healthy: true, reason: "shell-template (no agent binary needed)", executor_id: executorId };
  }

  if (binary === "cursor-sdk") {
    if (!process.env.CURSOR_API_KEY) {
      return { healthy: false, reason: "CURSOR_API_KEY not set", executor_id: executorId };
    }
    try {
      require.resolve("@cursor/sdk");
      return { healthy: true, reason: "cursor-sdk available", executor_id: executorId };
    } catch {
      return { healthy: false, reason: "@cursor/sdk not installed", executor_id: executorId };
    }
  }

  if (binary === "codex" || binary === "agent") {
    const which = probeWhichBinary(binary, timeoutMs);
    if (which.ok) {
      return {
        healthy: true,
        reason: `${binary} on PATH`,
        probe_command: which.probeCmd,
        probe_output: which.output.slice(0, 400),
        executor_id: executorId,
      };
    }
    // Windows: cursor-agent often lives under %LOCALAPPDATA%\cursor-agent
    if (binary === "agent" && process.platform === "win32") {
      const local = process.env.LOCALAPPDATA;
      if (local) {
        const agentCmd = join(local, "cursor-agent", "agent.cmd");
        if (existsSync(agentCmd)) {
          return {
            healthy: true,
            reason: `agent found under %LOCALAPPDATA%\\cursor-agent`,
            probe_command: agentCmd,
            executor_id: executorId,
          };
        }
      }
    }
    return {
      healthy: false,
      reason: `${binary} not found on PATH`,
      probe_command: which.probeCmd,
      probe_output: which.output || undefined,
      executor_id: executorId,
    };
  }

  const probeCmd = `npx --prefix "${workspaceRoot}" ${binary} --version`;
  const r = spawnSync("npx", ["--prefix", workspaceRoot, binary, "--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: timeoutMs,
  });

  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();

  if (r.error) {
    return {
      healthy: false,
      reason: r.error.message,
      probe_command: probeCmd,
      probe_output: output || undefined,
      executor_id: executorId,
    };
  }
  if (r.status !== 0) {
    return {
      healthy: false,
      reason: `exit ${String(r.status)}`,
      probe_command: probeCmd,
      probe_output: output || undefined,
      executor_id: executorId,
    };
  }
  return {
    healthy: true,
    reason: `${binary} --version ok`,
    probe_command: probeCmd,
    probe_output: output || undefined,
    executor_id: executorId,
  };
}

/**
 * 带 TTL 缓存的健康检查包装器。
 * 默认 5 min 内同一 executorId + commandTemplate 组合复用缓存结果。
 */
export function createExecutorHealthCache(ttlMs: number = DEFAULT_CACHE_TTL_MS) {
  let last: { key: string; result: ExecutorHealthStatus; at: number } | null = null;

  return {
    async check(
      executorId: string,
      commandTemplate: string,
      opts?: { timeoutMs?: number; workspaceRoot?: string },
    ): Promise<ExecutorHealthStatus> {
      const key = `${executorId}::${commandTemplate}`;
      const now = Date.now();
      if (last && last.key === key && now - last.at < ttlMs) {
        return last.result;
      }
      const result = await checkExecutorHealth(executorId, commandTemplate, opts);
      last = { key, result, at: now };
      return result;
    },
    clear() {
      last = null;
    },
  };
}
