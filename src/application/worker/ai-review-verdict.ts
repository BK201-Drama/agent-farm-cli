export type AiReviewVerdict = { kind: "pass" } | { kind: "fail"; reason?: string } | { kind: "none" };

export function parseAiReviewVerdict(output: string): AiReviewVerdict {
  const trimmed = output.trimEnd();
  if (!trimmed) return { kind: "none" };

  const lastNewline = trimmed.lastIndexOf("\n");
  const lastLine = lastNewline >= 0 ? trimmed.slice(lastNewline + 1).trim() : trimmed.trim();
  if (!lastLine) return { kind: "none" };

  let obj: unknown;
  try {
    obj = JSON.parse(lastLine);
  } catch {
    return { kind: "none" };
  }

  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { kind: "none" };
  }

  const record = obj as Record<string, unknown>;
  const verdict = typeof record.verdict === "string" ? record.verdict.toLowerCase().trim() : "";
  if (verdict === "pass") {
    return { kind: "pass" };
  }
  if (verdict === "fail") {
    const reason = typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : undefined;
    return { kind: "fail", reason };
  }
  return { kind: "none" };
}

export function stripVerdictLine(output: string): string {
  const trimmed = output.trimEnd();
  if (!trimmed) return output;

  const lastNewline = trimmed.lastIndexOf("\n");
  if (lastNewline < 0) {
    if (isVerdictJsonLine(trimmed.trim())) return "";
    return output;
  }

  const lastLine = trimmed.slice(lastNewline + 1).trim();
  if (isVerdictJsonLine(lastLine)) {
    return trimmed.slice(0, lastNewline).trimEnd();
  }
  return output;
}

function isVerdictJsonLine(line: string): boolean {
  try {
    const obj = JSON.parse(line);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const v = (obj as Record<string, unknown>).verdict;
      if (typeof v !== "string") return false;
      const lower = v.toLowerCase().trim();
      return lower === "pass" || lower === "fail";
    }
  } catch {
    /* ignore */
  }
  return false;
}
