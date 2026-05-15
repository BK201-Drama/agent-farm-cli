/** 单行摘要截断（与 doctor / status / insights --brief 一致，默认 80 字符）。 */
export function briefTruncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}…`;
}

export function formatStatusCountsLine(statusCounts: Record<string, number> | undefined): string | undefined {
  if (statusCounts == null || Object.keys(statusCounts).length === 0) {
    return undefined;
  }
  const statusLine = Object.entries(statusCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, c]) => `${s}=${c}`)
    .join(", ");
  return `status: ${statusLine}`;
}

function formatBriefCountedLines(rows: Array<{ count: number; text: string }>, heading: string): string[] {
  const lines: string[] = [heading];
  for (const row of rows.slice(0, 5)) {
    lines.push(`  [${row.count}] ${briefTruncate(row.text)}`);
  }
  return lines;
}

/** `failure_hotspots` / doctor 的 `top failures`（字段 `reason`）。 */
export function formatBriefFailureReasonLines(
  items: Array<{ reason: string; count: number }> | undefined,
  heading: string,
): string[] {
  if (!items?.length) {
    return [];
  }
  return formatBriefCountedLines(
    items.map((h) => ({ count: h.count, text: h.reason })),
    heading,
  );
}

/** insights `failure_top`（字段 `error`）。 */
export function formatBriefFailureErrorLines(
  items: Array<{ error: string; count: number }> | undefined,
  heading: string,
): string[] {
  if (!items?.length) {
    return [];
  }
  return formatBriefCountedLines(
    items.map((f) => ({ count: f.count, text: f.error })),
    heading,
  );
}

export function writeCliBriefToStderr(lines: string[]): void {
  process.stderr.write(`${lines.join("\n")}\n`);
}
