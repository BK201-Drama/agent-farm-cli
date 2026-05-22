/** @typedef {{ tasks_total?: number; status_counts?: Record<string, number> }} StatusPayload */

const STATUS_ABBR = {
  running: "run",
  review: "rev",
  retry: "retry",
  queued: "q",
  claimed: "claim",
  failed: "fail",
  blocked: "blk",
  approved: "ok",
};

const STATUS_PRIORITY = ["running", "review", "retry", "queued", "claimed", "failed", "blocked", "approved"];

/** 状态行不展示已结束归档态，避免挤占 120 字符 */
const STATUS_LINE_SKIP = new Set(["done", "cancelled", "rejected"]);

/**
 * @param {Record<string, number> | undefined} counts
 * @returns {string}
 */
export function formatActiveStatusCounts(counts) {
  if (!counts || typeof counts !== "object") return "";
  const parts = [];
  const seen = new Set();
  for (const key of STATUS_PRIORITY) {
    const n = counts[key];
    if (typeof n !== "number" || n <= 0) continue;
    const abbr = STATUS_ABBR[key] ?? key;
    parts.push(`${abbr}:${n}`);
    seen.add(key);
  }
  for (const [key, n] of Object.entries(counts)) {
    if (seen.has(key) || STATUS_LINE_SKIP.has(key) || typeof n !== "number" || n <= 0) continue;
    parts.push(`${key}:${n}`);
  }
  return parts.join(" ");
}

/**
 * @param {string | undefined} stuckBrief
 * @returns {string}
 */
export function formatStuckPrefix(stuckBrief) {
  if (!stuckBrief) return "";
  const first = stuckBrief.split("\n")[0]?.trim() ?? "";
  if (!first || first.includes("未发现")) return "";
  return first.replace(/^stuck:\s*/i, "af:");
}

/**
 * @param {{ stuckBrief?: string; status?: StatusPayload }} input
 * @param {number} [maxLen]
 * @returns {string}
 */
export function formatFarmStatusLine(input, maxLen = 120) {
  const segments = [];
  const stuck = formatStuckPrefix(input.stuckBrief);
  if (stuck) segments.push(stuck);

  const active = formatActiveStatusCounts(input.status?.status_counts);
  if (active) segments.push(active);

  const total = input.status?.tasks_total;
  if (typeof total === "number") segments.push(`Σ${total}`);

  const line = segments.length > 0 ? segments.join(" · ") : "agent-farm";
  return line.slice(0, maxLen);
}
