import { runOpencodeAi } from "./opencode-cli.js";

/** 单次 `opencode-ai` 子进程超时（毫秒）；可用 `AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS` 覆盖（≥3000，上限 600000）。 */
export function resolveOpencodeCliTimeoutMsFromEnv(): number {
  const n = Number(process.env.AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 3000) return Math.min(n, 600_000);
  return 90_000;
}

export type OpencodeSessionListItem = {
  id: string;
  title: string;
  updated: number;
  directory?: string;
};

export type OpencodeFeedRow = {
  sessionId: string;
  title: string;
  /** reasoning | tool | text */
  kind: string;
  body: string;
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * OpenCode `session.directory` 与看板 `--workspace`（队列 cwd）对齐。
 * 除根目录完全一致外，**允许仓库根下的子路径**（含 `.agent-farm/worktrees/...`），否则并行 worktree 会话会被滤光。
 */
export function directoryMatchesWorkspace(sessionDir: string | undefined, workspaceRoot: string): boolean {
  if (!sessionDir?.trim()) return false;
  const a = normalizePath(sessionDir);
  const b = normalizePath(workspaceRoot);
  if (a === b) return true;
  return a.startsWith(`${b}/`);
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function formatToolPart(p: Record<string, unknown>): string {
  const name = String(p.tool ?? "tool");
  const state = p.state as Record<string, unknown> | undefined;
  const status = state?.status != null ? String(state.status) : "";
  const input = state?.input;
  if (name === "task" && input && typeof input === "object" && input !== null && "prompt" in input) {
    return `task · ${clip(String((input as { prompt?: string }).prompt ?? ""), 72)}`;
  }
  if (input && typeof input === "object") {
    const keys = Object.keys(input as object).slice(0, 3).join(",");
    return `${name}${status ? ` · ${status}` : ""} · {${keys}}`;
  }
  return `${name}${status ? ` · ${status}` : ""}`;
}

/** 从 export JSON 中抽取最近若干条「可读的」推理/工具/回复片段 */
export function extractFeedRowsFromExport(
  exportJson: Record<string, unknown>,
  maxRows: number,
): OpencodeFeedRow[] {
  const sid = String((exportJson.info as Record<string, unknown> | undefined)?.id ?? "").slice(0, 18);
  const title = String((exportJson.info as Record<string, unknown> | undefined)?.title ?? "");
  const messages = exportJson.messages as unknown[] | undefined;
  if (!Array.isArray(messages)) return [];

  const out: OpencodeFeedRow[] = [];
  for (let mi = messages.length - 1; mi >= 0 && out.length < maxRows; mi--) {
    const m = messages[mi] as Record<string, unknown>;
    if (String((m.info as Record<string, unknown> | undefined)?.role ?? "") !== "assistant") continue;
    const parts = m.parts as unknown[] | undefined;
    if (!Array.isArray(parts)) continue;
    for (let pi = parts.length - 1; pi >= 0 && out.length < maxRows; pi--) {
      const p = parts[pi] as Record<string, unknown>;
      const ty = String(p.type ?? "");
      if (ty === "reasoning" && typeof p.text === "string" && p.text.trim()) {
        out.push({ sessionId: sid, title, kind: "推理", body: clip(p.text, 140) });
      } else if (ty === "tool") {
        out.push({ sessionId: sid, title, kind: "工具", body: clip(formatToolPart(p), 120) });
      } else if (ty === "text" && typeof p.text === "string" && p.text.trim()) {
        out.push({ sessionId: sid, title, kind: "回复", body: clip(p.text, 120) });
      }
    }
  }
  return out;
}

export type BuildOpencodeFeedOptions = {
  workspaceRoot: string;
  /** 最多拉取多少个会话的 export */
  maxSessions: number;
  /** 每个会话最多几条摘要 */
  rowsPerSession: number;
};

/**
 * 列出当前工作区目录下的最近会话，并并行 export，合并为 feed 行（时间倒序上最近的片段在前）。
 */
export async function buildOpencodeFeed(opts: BuildOpencodeFeedOptions): Promise<OpencodeFeedRow[]> {
  const timeoutMs = resolveOpencodeCliTimeoutMsFromEnv();
  const listR = await runOpencodeAi(
    opts.workspaceRoot,
    [
      "session",
      "list",
      "--format",
      "json",
      "-n",
      String(Math.max(opts.maxSessions * 4, 8)),
    ],
    { timeoutMs },
  );
  if (!listR.ok) {
    throw new Error(listR.stderr.trim() || `opencode session list failed (${String(listR.status)})`);
  }
  let items: OpencodeSessionListItem[];
  try {
    items = JSON.parse(listR.stdout) as OpencodeSessionListItem[];
  } catch {
    throw new Error("opencode session list: invalid JSON");
  }
  if (!Array.isArray(items)) return [];

  const here = items
    .filter((x) => directoryMatchesWorkspace(x.directory, opts.workspaceRoot))
    .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
    .slice(0, opts.maxSessions);

  const exports = await Promise.all(
    here.map((s) => runOpencodeAi(opts.workspaceRoot, ["export", s.id], { timeoutMs })),
  );

  const merged: OpencodeFeedRow[] = [];
  for (let i = 0; i < here.length; i++) {
    const ex = exports[i];
    if (!ex?.ok) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(ex.stdout) as Record<string, unknown>;
    } catch {
      continue;
    }
    merged.push(...extractFeedRowsFromExport(data, opts.rowsPerSession));
  }
  return merged.slice(0, opts.maxSessions * opts.rowsPerSession);
}
