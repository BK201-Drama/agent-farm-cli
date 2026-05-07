import { describe, expect, it } from "vitest";
import { sanitizeTaskIdForPath } from "../src/infrastructure/git/agent-farm-worktree.js";

describe("sanitizeTaskIdForPath", () => {
  it("replaces unsafe path characters", () => {
    expect(sanitizeTaskIdForPath("a/b:c")).toBe("a_b_c");
  });

  it("falls back for empty", () => {
    expect(sanitizeTaskIdForPath("")).toBe("task");
  });

  it("truncates long ids", () => {
    expect(sanitizeTaskIdForPath("x".repeat(200)).length).toBe(120);
  });
});
