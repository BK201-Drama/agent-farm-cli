import { describe, expect, it } from "vitest";
import {
  formatActiveStatusCounts,
  formatFarmStatusLine,
  formatStuckPrefix,
} from "../../scripts/lib/farm-status-line-format.mjs";

describe("formatStuckPrefix", () => {
  it("maps stuck brief to af: prefix", () => {
    expect(formatStuckPrefix("stuck: 2 项 · retry 建议")).toBe("af:2 项 · retry 建议");
  });

  it("returns empty when no stuck", () => {
    expect(formatStuckPrefix("stuck: 未发现卡住项")).toBe("");
    expect(formatStuckPrefix("")).toBe("");
  });
});

describe("formatActiveStatusCounts", () => {
  it("shows priority statuses with abbreviations", () => {
    expect(
      formatActiveStatusCounts({
        done: 10,
        running: 1,
        review: 2,
        queued: 3,
      }),
    ).toBe("run:1 rev:2 q:3");
  });

  it("omits zero counts", () => {
    expect(formatActiveStatusCounts({ running: 0, failed: 1 })).toBe("fail:1");
  });
});

describe("formatFarmStatusLine", () => {
  it("joins stuck, active counts, and total", () => {
    const line = formatFarmStatusLine({
      stuckBrief: "stuck: 1 项",
      status: {
        tasks_total: 12,
        status_counts: { running: 1, review: 1, done: 10 },
      },
    });
    expect(line).toContain("af:1 项");
    expect(line).toContain("run:1");
    expect(line).toContain("rev:1");
    expect(line).toContain("Σ12");
    expect(line.length).toBeLessThanOrEqual(120);
  });

  it("falls back to agent-farm when empty", () => {
    expect(formatFarmStatusLine({})).toBe("agent-farm");
  });

  it("truncates to maxLen", () => {
    const long = formatFarmStatusLine(
      {
        stuckBrief: "stuck: " + "x".repeat(200),
        status: { tasks_total: 99, status_counts: { queued: 50 } },
      },
      40,
    );
    expect(long.length).toBe(40);
  });
});
