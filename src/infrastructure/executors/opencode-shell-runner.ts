import type { ShellRunOptions, ShellRunner } from "../../domain/ports/shell-runner.js";
import { createOpencodeJsonStreamObserver, ensureOpencodeRunFormatJson } from "../opencode/opencode-json-stream.js";
import {
  createClaudeCodeJsonStreamObserver,
  ensureClaudeRunStreamJson,
} from "../claude-code/claude-code-json-stream.js";

export type OpencodeStreamObserver = ReturnType<typeof createOpencodeJsonStreamObserver>;
export type ClaudeCodeStreamObserver = ReturnType<typeof createClaudeCodeJsonStreamObserver>;

/** 通用 agent 流观察器联合类型 */
export type AgentStreamObserver = OpencodeStreamObserver | ClaudeCodeStreamObserver;

export function commandLooksLikeOpencodeRun(cmd: string): boolean {
  return /\bopencode-ai\s+run\b/.test(cmd);
}

export function commandLooksLikeClaudeRun(cmd: string): boolean {
  return /\bclaude\b/.test(cmd) && !/\bclaude-code\b/i.test(cmd);
}

/**
 * 当 enableStream 且命令匹配 opencode-ai run 或 claude 时启用 NDJSON 观察器并插入对应 format 标志。
 */
export async function runShellWithOptionalOpencodeJsonStream(
  cmd: string,
  opts: {
    runShell: ShellRunner;
    onHeartbeat: () => Promise<void>;
    shouldAbort?: () => Promise<boolean>;
    onStreamObserver?: (obs: AgentStreamObserver) => void;
    env: NodeJS.ProcessEnv;
    enableStream: boolean;
  },
): Promise<{ exitCode: number; output: string; streamObs: AgentStreamObserver | undefined }> {
  const useOpencode = opts.enableStream && commandLooksLikeOpencodeRun(cmd);
  const useClaude = opts.enableStream && !useOpencode && commandLooksLikeClaudeRun(cmd);

  let finalCmd = cmd;
  let streamObs: AgentStreamObserver | undefined;

  if (useOpencode) {
    finalCmd = ensureOpencodeRunFormatJson(cmd);
    streamObs = createOpencodeJsonStreamObserver();
  } else if (useClaude) {
    finalCmd = ensureClaudeRunStreamJson(cmd);
    streamObs = createClaudeCodeJsonStreamObserver();
  }

  if (streamObs) opts.onStreamObserver?.(streamObs);

  const shellOpts: ShellRunOptions = {
    onHeartbeat: opts.onHeartbeat,
    shouldAbort: opts.shouldAbort,
    env: opts.env,
  };
  if (streamObs) {
    shellOpts.onStdoutLine = (line) => streamObs.onStdoutLine(line);
    shellOpts.onStderrLine = (line) => streamObs.onStderrLine(line);
  }
  const result = await opts.runShell(finalCmd, shellOpts);
  return { exitCode: result.exitCode, output: result.output, streamObs };
}
