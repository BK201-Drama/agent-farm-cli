import { spawn, type ChildProcess } from "node:child_process";

export type RunOpencodeAiOptions = {
  /** 单次子进程上限；超时后 kill，避免看板/export 永久挂起。 */
  timeoutMs?: number;
};

/**
 * 单次 `opencode-ai` 子进程超时（毫秒）；可用 `AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS` 覆盖（≥3000，上限 600000）。
 * 未设置时使用 90s 默认。
 */
export function resolveOpencodeCliTimeoutMsFromEnv(): number {
  const n = Number(process.env.AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 3000) return Math.min(n, 600_000);
  return 90_000;
}

/**
 * 在指定仓库根下调用本地 `opencode-ai`（与 worker dispatch 一致用 npx --prefix）。
 *
 * @param workspaceRoot - 仓库根目录路径，作为 npx --prefix 的值
 * @param args - 传递给 opencode-ai 的命令行参数数组
 * @param options - 可选配置项
 * @param options.timeoutMs - 单次子进程超时毫秒数，超时后 kill，默认为 90000ms
 * @returns 包含执行结果的 Promise：ok 是否成功、status 退出码、stdout/stderr 输出内容
 *
 * Windows 注意事项：
 * - `shell: true` 让 Windows 通过 shell 解析 npx / opencode-ai.cmd 等 shim，
 *   代价是 shell 解析开销和 Windows 上潜在的 PATH 扩展顺序差异。
 * - `windowsHide: true` 避免 spawn 的窗口子进程在任务栏闪烁。
 * - 若 `shell: false`，npx 可能在 Windows 上因找不到全局 bin 路径而失败，
 *   因此此处始终保持 `shell: true`（与跨平台 npm run 的默认行为一致）。
 */
export function runOpencodeAi(
  workspaceRoot: string,
  args: string[],
  options?: RunOpencodeAiOptions,
): Promise<{ ok: boolean; status: number | null; stdout: string; stderr: string }> {
  const timeoutMs = options?.timeoutMs ?? resolveOpencodeCliTimeoutMsFromEnv();
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
