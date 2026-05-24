/**
 * Claude Code `--output-format stream-json` 输出为按行 JSON（NDJSON），用于可观测与失败时生成自愈提示。
 * 事件 schema 随 claude 版本可能变化，此处做宽松解析。
 */

const CLAUDE_HEAL_APPEND_CAP = 3500;

export type ClaudeCodeStreamSummary = {
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

function digestUnknownRecord(obj: Record<string, unknown>, summary: ClaudeCodeStreamSummary): void {
  const ty = obj.type != null ? String(obj.type) : "";
  if (ty) {
    summary.eventTypes.push(ty);
    if (summary.eventTypes.length > 120) summary.eventTypes.shift();
  }

  // Claude Code result events: success/error/subtype
  if (ty === "result") {
    const subtype = String(obj.subtype ?? "");
    if (subtype === "error" || subtype === "error_during_execution") {
      const errors = obj.errors as Array<{ message?: string }> | undefined;
      if (errors?.length) {
        for (const e of errors) pushCap(summary.errorSnippets, String(e.message ?? ""), 12, 400);
      }
      if (obj.output != null) pushCap(summary.errorSnippets, String(obj.output).slice(0, 400), 12, 400);
    }
  }

  // error events (system errors, tool errors)
  if (ty === "error" || ty === "tool_error" || String(obj.level ?? "").toLowerCase() === "error") {
    const msg = obj.message ?? obj.text ?? obj.content ?? obj.error;
    if (msg != null) pushCap(summary.errorSnippets, String(msg), 12, 400);
  }

  // assistant message content blocks may contain tool results
  const msg = obj.message as Record<string, unknown> | undefined;
  if (msg?.content && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (typeof block !== "object" || !block) continue;
      const b = block as Record<string, unknown>;
      if (b.type === "tool_result" && b.is_error) {
        const content = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        pushCap(summary.toolIssues, content.slice(0, 300), 8, 300);
      }
    }
  }

  // catch permission/rate-limit/keyword errors in any field
  const flat = JSON.stringify(obj).slice(0, 800);
  if (/permission|denied|not.?allowed|eacces/i.test(flat)) {
    pushCap(summary.errorSnippets, "permission denied", 12, 400);
  }
  if (/429|rate.?limit|quota|throttl/i.test(flat)) {
    pushCap(summary.errorSnippets, "rate limit hit", 12, 400);
  }
}

export function createClaudeCodeJsonStreamObserver(): {
  onStdoutLine: (line: string) => void;
  onStderrLine: (line: string) => void;
  snapshot: () => ClaudeCodeStreamSummary;
  healAppendixForRetry: () => string;
} {
  const summary: ClaudeCodeStreamSummary = {
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
      hints.push("若符合安全策略，可在命令模板中为 claude 增加 --dangerously-skip-permissions。");
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
      if (text.length <= CLAUDE_HEAL_APPEND_CAP) return text;
      return `${text.slice(0, CLAUDE_HEAL_APPEND_CAP - 20)}\n...(truncated)`;
    },
  };
}

export function stripClaudeHealAppendix(prompt: string): string {
  return prompt.replace(/\n\n\[claude-heal\][\s\S]*$/, "").trimEnd();
}

/**
 * 在常见模板中插入 `--output-format stream-json` 与 `--verbose`（若尚无）。
 * 仅处理 `claude` 子串（不匹配 claude-code 等其他形式）。
 * `--output-format stream-json` 在 -p/--print 模式下需要 `--verbose`。
 */
export function ensureClaudeRunStreamJson(command: string): string {
  if (!/\bclaude\b/.test(command) && !/\bclaude\.exe\b/i.test(command)) return command;
  if (/\bclaude-code\b/i.test(command)) return command;

  let result = command;
  if (!/--output-format\s+stream-json\b/.test(result)) {
    if (/\s-p\s/.test(result) || /\s--print\b/.test(result)) {
      result = result.replace(/(\s(?:-p|--print)\s)/, " --output-format stream-json$1");
    } else {
      result = `${result} --output-format stream-json`;
    }
  }
  if (!/--verbose\b/.test(result)) {
    if (/\s-p\s/.test(result) || /\s--print\b/.test(result)) {
      result = result.replace(/(\s(?:-p|--print)\s)/, " --verbose$1");
    } else {
      result = `${result} --verbose`;
    }
  }
  return result;
}
