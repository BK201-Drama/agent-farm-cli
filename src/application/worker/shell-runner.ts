import { spawn } from "node:child_process";

export type ShellRunOptions = {
  onHeartbeat?: () => Promise<void>;
  heartbeatMs?: number;
  env?: NodeJS.ProcessEnv;
};

export type ShellRunner = (
  command: string,
  options?: ShellRunOptions
) => Promise<{ exitCode: number; output: string }>;

/** 默认通过 bash -lc 执行命令；单测可注入替代实现 */
export async function runShellCommand(
  command: string,
  options: ShellRunOptions = {}
): Promise<{ exitCode: number; output: string }> {
  const { onHeartbeat, heartbeatMs = 15000, env } = options;
  return await new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      stdio: ["ignore", "pipe", "pipe"],
      env: env ?? { ...process.env },
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
