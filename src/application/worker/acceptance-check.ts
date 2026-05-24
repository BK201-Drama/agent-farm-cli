import type { ShellRunner } from "../../domain/ports/shell-runner.js";

export async function runAcceptanceCheck(
  cmd: string,
  opts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    runShell: ShellRunner;
    timeoutMs?: number;
  },
): Promise<{ passed: boolean; output: string }> {
  const fullCmd = `cd "${opts.cwd}" && ${cmd}`;
  const { exitCode, output } = await opts.runShell(fullCmd, {
    env: opts.env,
    timeoutMs: opts.timeoutMs ?? 120_000,
  });
  return { passed: exitCode === 0, output };
}

/** 去掉上一轮 [verify-fail] 块，避免重试时堆叠 */
export function stripVerifyFailAppendix(prompt: string): string {
  return prompt.replace(/\n\n\[verify-fail\][\s\S]*$/, "").trimEnd();
}
