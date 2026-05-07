import { spawn, type ChildProcess } from "node:child_process";

/**
 * 在指定仓库根下调用本地 `opencode-ai`（与 worker dispatch 一致用 npx --prefix）。
 */
export function runOpencodeAi(
  workspaceRoot: string,
  args: string[],
): Promise<{ ok: boolean; status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn("npx", ["--prefix", workspaceRoot, "opencode-ai", ...args], {
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: string | Buffer) => {
      stdout += typeof c === "string" ? c : c.toString("utf8");
    });
    child.stderr?.on("data", (c: string | Buffer) => {
      stderr += typeof c === "string" ? c : c.toString("utf8");
    });
    child.on("error", (err: Error) => {
      resolve({ ok: false, status: null, stdout, stderr: `${stderr}\n${err.message}` });
    });
    child.on("close", (code: number | null) => {
      resolve({ ok: code === 0, status: code, stdout, stderr });
    });
  });
}
