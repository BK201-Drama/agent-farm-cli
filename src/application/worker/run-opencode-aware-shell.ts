import type { ShellRunOptions, ShellRunner } from "../../domain/ports/shell-runner.js";
import {
  createOpencodeJsonStreamObserver,
  ensureOpencodeRunFormatJson,
} from "../../infrastructure/opencode/opencode-json-stream.js";

export type OpencodeStreamObserver = ReturnType<typeof createOpencodeJsonStreamObserver>;

export function commandLooksLikeOpencodeRun(cmd: string): boolean {
  return /\bopencode-ai\s+run\b/.test(cmd);
}

/**
 * 仅当 enableStream 且命令像 `opencode-ai run` 时启用 NDJSON 观察器并插入 `--format json`。
 */
export async function runShellWithOptionalOpencodeJsonStream(
  cmd: string,
  opts: {
    runShell: ShellRunner;
    onHeartbeat: () => Promise<void>;
    env: NodeJS.ProcessEnv;
    enableStream: boolean;
  },
): Promise<{ exitCode: number; output: string; streamObs: OpencodeStreamObserver | undefined }> {
  const use = opts.enableStream && commandLooksLikeOpencodeRun(cmd);
  let finalCmd = cmd;
  if (use) {
    finalCmd = ensureOpencodeRunFormatJson(cmd);
  }
  const streamObs = use ? createOpencodeJsonStreamObserver() : undefined;
  const shellOpts: ShellRunOptions = { onHeartbeat: opts.onHeartbeat, env: opts.env };
  if (streamObs) {
    shellOpts.onStdoutLine = (line) => streamObs.onStdoutLine(line);
    shellOpts.onStderrLine = (line) => streamObs.onStderrLine(line);
  }
  const result = await opts.runShell(finalCmd, shellOpts);
  return { exitCode: result.exitCode, output: result.output, streamObs };
}
