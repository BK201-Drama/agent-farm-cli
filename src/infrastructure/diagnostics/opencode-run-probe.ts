import { spawnSync } from "node:child_process";

/** 与 `AGENT_FARM_SKIP_OPENCODE_PROBE` 对齐：测试/CI 跳过真实 `npx opencode-ai`。 */
export function isOpencodeRunProbeSkippedByEnv(): boolean {
  const v = String(process.env.AGENT_FARM_SKIP_OPENCODE_PROBE ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 探测本仓库下 `opencode-ai run` 是否提供 `--format json`（供 doctor 报告）。 */
export function probeOpencodeRunFormatJson(workspaceRoot: string): {
  ok: boolean;
  message: string;
  has_format_json: boolean;
} {
  if (isOpencodeRunProbeSkippedByEnv()) {
    return {
      ok: true,
      message: "skipped (AGENT_FARM_SKIP_OPENCODE_PROBE)",
      has_format_json: false,
    };
  }
  const r = spawnSync("npx", ["--prefix", workspaceRoot, "opencode-ai", "run", "--help"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: 45_000,
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  if (r.error) {
    return { ok: false, message: r.error.message, has_format_json: false };
  }
  if (r.status !== 0) {
    return { ok: false, message: `exit ${String(r.status)}`, has_format_json: false };
  }
  const has = /--format|format.*json|\bjson\b.*format/i.test(out);
  return {
    ok: true,
    message: has ? "opencode-ai run exposes format/json" : "help text did not mention json format",
    has_format_json: has,
  };
}
