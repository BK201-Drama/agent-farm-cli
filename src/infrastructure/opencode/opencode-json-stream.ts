/**
 * OpenCode `run --format json` 输出为按行 JSON（NDJSON），用于可观测与失败时生成自愈提示。
 * 事件 schema 随 opencode-ai 版本可能变化，此处做宽松解析。
 */

const OPENCODE_HEAL_APPEND_CAP = 3500;

export type OpencodeStreamSummary = {
  linesOk: number;
  linesInvalid: number;
  eventTypes: string[];
  errorSnippets: string[];
  toolIssues: string[];
};

function pushCap(arr: string[], s: string, max: number, capLen: number): void {
  if (arr.length >= max) return;
  const t = s.replace(/\s+/g, " ").trim().slice(0, capLen);
  if (t) arr.push(t);
}

function digestUnknownRecord(obj: Record<string, unknown>, summary: OpencodeStreamSummary): void {
  const ty = obj.type != null ? String(obj.type) : "";
  if (ty) {
    summary.eventTypes.push(ty);
    if (summary.eventTypes.length > 120) summary.eventTypes.shift();
  }

  const err =
    obj.error ??
    obj.err ??
    (typeof obj.message === "string" && /error|fail|denied|429/i.test(obj.message) ? obj.message : undefined);
  if (err != null) {
    pushCap(summary.errorSnippets, String(err), 12, 400);
  }

  if (ty === "error" || ty === "tool_error" || String(obj.level ?? "").toLowerCase() === "error") {
    const msg = obj.message ?? obj.text ?? obj.content;
    if (msg != null) pushCap(summary.errorSnippets, String(msg), 12, 400);
  }

  if (obj.tool != null || ty === "tool") {
    const st = (obj.state as Record<string, unknown> | undefined)?.status;
    const name = obj.tool ?? obj.name;
    if (String(st ?? "").toLowerCase().includes("fail") || String(st ?? "").toLowerCase().includes("error")) {
      pushCap(summary.toolIssues, `${String(name ?? "tool")}: ${String(st)}`, 8, 300);
    }
  }
}

export function createOpencodeJsonStreamObserver(): {
  onStdoutLine: (line: string) => void;
  onStderrLine: (line: string) => void;
  snapshot: () => OpencodeStreamSummary;
  healAppendixForRetry: () => string;
} {
  const summary: OpencodeStreamSummary = {
    linesOk: 0,
    linesInvalid: 0,
    eventTypes: [],
    errorSnippets: [],
    toolIssues: [],
  };

  const feed = (line: string): void => {
    const t = line.trim();
    if (!t) return;
    try {
      const obj = JSON.parse(t) as unknown;
      summary.linesOk++;
      if (obj && typeof obj === "object") {
        digestUnknownRecord(obj as Record<string, unknown>, summary);
      }
    } catch {
      summary.linesInvalid++;
      if (/\berror\b|\bfail(ed)?\b|denied|429|rate.?limit|permission/i.test(t)) {
        pushCap(summary.errorSnippets, t, 12, 400);
      }
    }
  };

  const healHints = (): string[] => {
    const hints: string[] = [];
    const blob = [...summary.errorSnippets, ...summary.toolIssues].join(" ").toLowerCase();
    if (/permission|denied|not allowed|eacces/.test(blob)) {
      hints.push("若符合安全策略，可在命令模板中为 opencode-ai run 增加 --dangerously-skip-permissions。");
    }
    if (/429|rate|limit|quota|throttl/.test(blob)) {
      hints.push("疑似限流或配额：降低并发 worker 数或稍后重试。");
    }
    if (/context|token|too long|maximum/.test(blob)) {
      hints.push("上下文或长度超限：缩小单次任务范围或拆分 prompt。");
    }
    if (/npm|module not found|cannot find module/.test(blob)) {
      hints.push("依赖缺失：确认 worktree 内已安装依赖，或仅用 AGENT_FARM_WORKSPACE_ROOT 调 npx。");
    }
    return hints;
  };

  return {
    onStdoutLine: feed,
    onStderrLine: feed,
    snapshot: () => ({
      linesOk: summary.linesOk,
      linesInvalid: summary.linesInvalid,
      eventTypes: [...summary.eventTypes.slice(-30)],
      errorSnippets: [...summary.errorSnippets],
      toolIssues: [...summary.toolIssues],
    }),
    healAppendixForRetry: () => {
      const snap = {
        linesOk: summary.linesOk,
        linesInvalid: summary.linesInvalid,
        recentTypes: summary.eventTypes.slice(-8).join(", "),
        errors: summary.errorSnippets,
        tools: summary.toolIssues,
        hints: healHints(),
      };
      const text = JSON.stringify(snap, null, 2);
      if (text.length <= OPENCODE_HEAL_APPEND_CAP) return text;
      return `${text.slice(0, OPENCODE_HEAL_APPEND_CAP - 20)}\n...(truncated)`;
    },
  };
}

/** 从 prompt 去掉上一轮 [opencode-heal] 块，避免重试时堆叠 */
export function stripOpencodeHealAppendix(prompt: string): string {
  return prompt.replace(/\n\n\[opencode-heal\][\s\S]*$/, "").trimEnd();
}

/**
 * 在常见模板中插入 `--format json`（若尚无）。仅处理 `opencode-ai run` 子串，避免误伤其它命令。
 */
export function ensureOpencodeRunFormatJson(command: string): string {
  if (!/\bopencode-ai\b/.test(command) || !/\brun\b/.test(command)) return command;
  if (/--format\s+json\b/.test(command)) return command;
  return command.replace(/\bopencode-ai\s+run\b/, "opencode-ai run --format json");
}
