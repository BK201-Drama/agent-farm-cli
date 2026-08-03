import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Cursor Agent CLI (`agent -p --output-format stream-json`) NDJSON 观察器。
 * 事件 schema 随 Cursor Agent 版本可能变化，此处做宽松解析。
 */

const CURSOR_AGENT_HEAL_APPEND_CAP = 3500;

export type CursorAgentStreamSummary = {
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

function digestUnknownRecord(obj: Record<string, unknown>, summary: CursorAgentStreamSummary): void {
  const ty = obj.type != null ? String(obj.type) : "";
  if (ty) {
    summary.eventTypes.push(ty);
    if (summary.eventTypes.length > 120) summary.eventTypes.shift();
  }

  if (ty === "error" || ty === "tool_error" || String(obj.level ?? "").toLowerCase() === "error") {
    const msg = obj.message ?? obj.text ?? obj.content ?? obj.error;
    if (msg != null) pushCap(summary.errorSnippets, String(msg), 12, 400);
  }

  const msg = obj.message as Record<string, unknown> | undefined;
  if (msg?.content && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (typeof block !== "object" || !block) continue;
      const b = block as Record<string, unknown>;
      if (b.type === "tool_use" || b.type === "tool_call") summary.toolCallCount++;
      if (b.type === "tool_result" && b.is_error) {
        const content = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        pushCap(summary.toolIssues, content.slice(0, 300), 8, 300);
      }
    }
  }

  if (ty === "tool_call" || ty === "tool_use") summary.toolCallCount++;

  const usage = obj.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
    const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
    if (input !== undefined) summary.inputTokens = (summary.inputTokens ?? 0) + input;
    if (output !== undefined) summary.outputTokens = (summary.outputTokens ?? 0) + output;
  }

  const flat = JSON.stringify(obj).slice(0, 800);
  if (/permission|denied|not.?allowed|eacces|unauthorized|api.?key|trust/i.test(flat)) {
    pushCap(summary.errorSnippets, "permission/auth denied", 12, 400);
  }
  if (/429|rate.?limit|quota|throttl/i.test(flat)) {
    pushCap(summary.errorSnippets, "rate limit hit", 12, 400);
  }
}

export function createCursorAgentJsonStreamObserver(): {
  onStdoutLine: (line: string) => void;
  onStderrLine: (line: string) => void;
  snapshot: () => CursorAgentStreamSummary;
  healAppendixForRetry: () => string;
} {
  const summary: CursorAgentStreamSummary = {
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
      if (/\berror\b|\bfail(ed)?\b|denied|429|rate.?limit|permission|trust|api.?key/i.test(t)) {
        pushCap(summary.errorSnippets, t, 12, 400);
      }
    }
  };

  const healHints = (): string[] => {
    const hints: string[] = [];
    const blob = [...summary.errorSnippets, ...summary.toolIssues].join(" ").toLowerCase();
    if (/permission|denied|auth|api.?key|unauthorized/.test(blob)) {
      hints.push("鉴权：设置 CURSOR_API_KEY，或运行 `agent login`；模板需含 --api-key 时可走环境变量。");
    }
    if (/trust|workspace trust/.test(blob)) {
      hints.push("工作区信任：在 headless 模板中加入 --trust（或 -f/--force/--yolo）。");
    }
    if (/429|rate|limit|quota|throttl/.test(blob)) {
      hints.push("疑似限流：降低并发或稍后重试。");
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
      if (text.length <= CURSOR_AGENT_HEAL_APPEND_CAP) return text;
      return `${text.slice(0, CURSOR_AGENT_HEAL_APPEND_CAP - 20)}\n...(truncated)`;
    },
  };
}

export function stripCursorAgentHealAppendix(prompt: string): string {
  return prompt.replace(/\n\n\[cursor-agent-heal\][\s\S]*$/, "").trimEnd();
}

/**
 * 确保 `agent -p` / `cursor-agent -p` 模板带 `--output-format stream-json`。
 */
export function ensureCursorAgentStreamJson(command: string): string {
  if (!commandLooksLikeCursorAgentRun(command)) return command;
  let cmd = normalizeCursorAgentWinCommand(command);
  if (/--output-format\s+stream-json\b/.test(cmd)) return cmd;
  if (/--output-format\s+\S+/.test(cmd)) {
    return cmd.replace(/--output-format\s+\S+/, "--output-format stream-json");
  }
  // insert after -p/--print if present
  if (/\s(-p|--print)\b/.test(cmd)) {
    return cmd.replace(/\s(-p|--print)\b/, " $1 --output-format stream-json");
  }
  return `${cmd.trim()} --output-format stream-json`;
}

/** Windows Git Bash：裸 `agent` / `agent.cmd` 常不在 PATH；改写为绝对 MSYS 路径。 */
export function normalizeCursorAgentWinCommand(command: string): string {
  if (process.platform !== "win32") return command;
  if (!commandLooksLikeCursorAgentRun(command)) return command;
  const local = process.env.LOCALAPPDATA;
  const absWin = local ? join(local, "cursor-agent", "agent.cmd") : "";
  if (absWin && existsSync(absWin)) {
    const msys = absWin.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_m, d: string) => `/${d.toLowerCase()}/`);
    return command.replace(
      /(^|[\s/"'\\])(?:cursor-agent|agent)(?:\.cmd|\.exe)?(?=\s|$)/i,
      `$1"${msys}"`,
    );
  }
  return command.replace(/(^|[\s/"'\\])agent(?!\.cmd|\.exe|-farm)(?=\s|$)/i, "$1agent.cmd");
}

export function commandLooksLikeCursorAgentRun(cmd: string): boolean {
  // `agent -p` / `cursor-agent -p` / `agent.cmd --print`
  if (/\bcursor-agent(\.cmd|\.exe)?\b/i.test(cmd) && /\s(-p|--print)\b/.test(cmd)) return true;
  // bare `agent` binary (avoid matching "agent-farm")
  if (/(^|[\s/"'\\])agent(\.cmd|\.exe)?(\s|$)/i.test(cmd) && !/\bagent-farm\b/i.test(cmd) && /\s(-p|--print)\b/.test(cmd)) {
    return true;
  }
  return false;
}
