import { spawn, spawnSync } from "node:child_process";

export type ShellRunOptions = {
  onHeartbeat?: () => Promise<void>;
  heartbeatMs?: number;
  env?: NodeJS.ProcessEnv;
};

export type ShellRunner = (
  command: string,
  options?: ShellRunOptions
) => Promise<{ exitCode: number; output: string }>;

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

/** 默认通过 bash -lc 执行命令（Windows 无 bash 时回退 cmd /c）；单测可注入替代实现 */
export async function runShellCommand(
  command: string,
  options: ShellRunOptions = {}
): Promise<{ exitCode: number; output: string }> {
  const { onHeartbeat, heartbeatMs = 15000, env } = options;
  const [shellBin, shellArgs] = resolveShellArgv(command);
  return await new Promise((resolve) => {
    const child = spawn(shellBin, shellArgs, {
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
