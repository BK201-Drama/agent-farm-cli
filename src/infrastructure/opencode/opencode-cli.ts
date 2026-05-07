import { spawn, type ChildProcess } from "node:child_process";

export type RunOpencodeAiOptions = {
  /** 单次子进程上限；超时后 kill，避免看板/export 永久挂起 */
  timeoutMs?: number;
};

/**
 * 在指定仓库根下调用本地 `opencode-ai`（与 worker dispatch 一致用 npx --prefix）。
 */
export function runOpencodeAi(
  workspaceRoot: string,
  args: string[],
  options?: RunOpencodeAiOptions,
): Promise<{ ok: boolean; status: number | null; stdout: string; stderr: string }> {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  return new Promise((resolve) => {
    const child: ChildProcess = spawn("npx", ["--prefix", workspaceRoot, "opencode-ai", ...args], {
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r: { ok: boolean; status: number | null; stdout: string; stderr: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        status: null,
        stdout,
        stderr: `${stderr}\nopencode-ai: exceeded ${timeoutMs}ms`,
      });
    }, timeoutMs);
    child.stdout?.on("data", (c: string | Buffer) => {
      stdout += typeof c === "string" ? c : c.toString("utf8");
    });
    child.stderr?.on("data", (c: string | Buffer) => {
      stderr += typeof c === "string" ? c : c.toString("utf8");
    });
    child.on("error", (err: Error) => {
      finish({ ok: false, status: null, stdout, stderr: `${stderr}\n${err.message}` });
    });
    child.on("close", (code: number | null) => {
      finish({ ok: code === 0, status: code, stdout, stderr });
    });
  });
}
