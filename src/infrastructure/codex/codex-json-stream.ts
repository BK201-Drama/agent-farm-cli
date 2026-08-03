/**
 * Codex `exec --json` 输出为按行 JSON（NDJSON），用于可观测与失败时生成自愈提示。
 * 事件 schema 随 Codex CLI 版本可能变化，此处做宽松解析。
 */

const CODEX_HEAL_APPEND_CAP = 3500;

export type CodexStreamSummary = {
  linesOk: number;
  linesInvalid: number;
  eventTypes: string[];
  errorSnippets: string[];
  toolIssues: string[];
  toolCallCount: number;
  inputTokens?: number;
  outputTokens?: number;
};

function pushCap(arr: string[], s: string, max: number, capLen: number): void {
  if (arr.length >= max) return;
  const t = s.replace(/\s+/g, " ").trim().slice(0, capLen);
  if (t) arr.push(t);
}

function digestUnknownRecord(obj: Record<string, unknown>, summary: CodexStreamSummary): void {
  const ty = obj.type != null ? String(obj.type) : obj.msg != null ? String((obj.msg as Record<string, unknown>)?.type ?? "") : "";
  if (ty) {
    summary.eventTypes.push(ty);
    if (summary.eventTypes.length > 120) summary.eventTypes.shift();
  }

  const err = obj.error ?? obj.err ?? (typeof obj.message === "string" && /error|fail|denied|429/i.test(obj.message) ? obj.message : undefined);
  if (err != null) pushCap(summary.errorSnippets, String(err), 12, 400);

  if (ty === "error" || ty === "turn.failed" || String(obj.level ?? "").toLowerCase() === "error") {
    const msg = obj.message ?? obj.text ?? obj.content;
    if (msg != null) pushCap(summary.errorSnippets, String(msg), 12, 400);
  }

  if (ty === "item.completed" || ty === "tool_call" || ty === "function_call") {
    summary.toolCallCount++;
  }

  const usage = (obj.usage ?? (obj.msg as Record<string, unknown> | undefined)?.usage) as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const input = typeof usage.input_tokens === "number" ? usage.input_tokens : typeof usage.input === "number" ? usage.input : undefined;
    const output = typeof usage.output_tokens === "number" ? usage.output_tokens : typeof usage.output === "number" ? usage.output : undefined;
    if (input !== undefined) summary.inputTokens = (summary.inputTokens ?? 0) + input;
    if (output !== undefined) summary.outputTokens = (summary.outputTokens ?? 0) + output;
  }

  const flat = JSON.stringify(obj).slice(0, 800);
  if (/permission|denied|not.?allowed|eacces|unauthorized|login/i.test(flat)) {
    pushCap(summary.errorSnippets, "permission/auth denied", 12, 400);
  }
  if (/429|rate.?limit|quota|throttl/i.test(flat)) {
    pushCap(summary.errorSnippets, "rate limit hit", 12, 400);
  }
}

export function createCodexJsonStreamObserver(): {
  onStdoutLine: (line: string) => void;
  onStderrLine: (line: string) => void;
  snapshot: () => CodexStreamSummary;
  healAppendixForRetry: () => string;
} {
  const summary: CodexStreamSummary = {
    linesOk: 0,
    linesInvalid: 0,
    eventTypes: [],
    errorSnippets: [],
    toolIssues: [],
    toolCallCount: 0,
  };

  const feed = (line: string): void => {
    const t = line.trim();
    if (!t) return;
    try {
      const obj = JSON.parse(t) as unknown;
      summary.linesOk++;
      if (obj && typeof obj === "object") digestUnknownRecord(obj as Record<string, unknown>, summary);
    } catch {
      summary.linesInvalid++;
      if (/\berror\b|\bfail(ed)?\b|denied|429|rate.?limit|permission|auth/i.test(t)) {
        pushCap(summary.errorSnippets, t, 12, 400);
      }
    }
  };

  const healHints = (): string[] => {
    const hints: string[] = [];
    const blob = [...summary.errorSnippets, ...summary.toolIssues].join(" ").toLowerCase();
    if (/permission|denied|auth|login|unauthorized/.test(blob)) {
      hints.push("鉴权失败：本机先 `codex login`，或在 CI 设置 CODEX_API_KEY；勿盲目隔离 CODEX_HOME 导致丢登录态。");
    }
    if (/429|rate|limit|quota|throttl/.test(blob)) {
      hints.push("疑似限流或配额：降低并发 worker 数或稍后重试。");
    }
    if (/sandbox|read.?only|permission/.test(blob)) {
      hints.push("沙箱过严：写代码任务需 `--sandbox workspace-write` 或 `danger-full-access`。");
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
      toolCallCount: summary.toolCallCount,
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
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
      if (text.length <= CODEX_HEAL_APPEND_CAP) return text;
      return `${text.slice(0, CODEX_HEAL_APPEND_CAP - 20)}\n...(truncated)`;
    },
  };
}

export function stripCodexHealAppendix(prompt: string): string {
  return prompt.replace(/\n\n\[codex-heal\][\s\S]*$/, "").trimEnd();
}

/** 在 `codex exec` 模板中插入 `--json`（若尚无）。 */
export function ensureCodexExecJson(command: string): string {
  if (!/\bcodex\b/.test(command) || !/\bexec\b/.test(command)) return command;
  if (/--json\b/.test(command)) return command;
  return command.replace(/\bcodex(\.cmd|\.exe)?\s+exec\b/i, "codex exec --json");
}
