import { spawnSync } from "node:child_process";
import { commandLooksLikeOpencodeRun, commandLooksLikeClaudeRun } from "../executors/opencode-shell-runner.js";

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
  const id = executorId.toLowerCase();
  if (id === "cursor-sdk" || id === "cursor_sdk") {
    return "cursor-sdk";
  }
  if (commandLooksLikeOpencodeRun(commandTemplate)) {
    return "opencode-ai";
  }
  if (commandLooksLikeClaudeRun(commandTemplate)) {
    return "claude";
  }
  return null;
}

/** 判断 command template 是否为纯 shell（不含 OpenCode / Claude Code 语法），可作为降级回退。 */
export function commandTemplateIsShellFallback(commandTemplate: string): boolean {
  const tpl = commandTemplate.trim();
  if (!tpl) return false;
  return !commandLooksLikeOpencodeRun(tpl) && !commandLooksLikeClaudeRun(tpl);
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
