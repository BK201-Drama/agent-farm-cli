import { describe, expect, it } from "vitest";
import {
  briefTruncate,
  formatBriefFailureErrorLines,
  formatBriefFailureReasonLines,
  formatStatusCountsLine,
} from "../../src/interfaces/cli/brief-stderr.js";

describe("brief-stderr helpers", () => {
  it("briefTruncate adds ellipsis when over max", () => {
    expect(briefTruncate("x".repeat(79), 80)).toHaveLength(79);
    expect(briefTruncate("x".repeat(80), 80)).toHaveLength(80);
    expect(briefTruncate("x".repeat(81), 80)).toBe(`${"x".repeat(80)}…`);
  });

  it("formatStatusCountsLine sorts keys and skips empty", () => {
    expect(formatStatusCountsLine(undefined)).toBeUndefined();
    expect(formatStatusCountsLine({})).toBeUndefined();
    expect(formatStatusCountsLine({ b: 2, a: 1 })).toBe("status: a=1, b=2");
  });

  it("formatBriefFailureReasonLines caps at 5", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ reason: `r${i}`, count: i }));
    const lines = formatBriefFailureReasonLines(items, "top:");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe("top:");
  });

  it("formatBriefFailureErrorLines maps error field", () => {
    const lines = formatBriefFailureErrorLines([{ error: "e1", count: 3 }], "fail:");
    expect(lines).toEqual(["fail:", "  [3] e1"]);
  });
});
