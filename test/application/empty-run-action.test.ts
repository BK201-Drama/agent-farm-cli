import { describe, expect, it } from "vitest";
import {
  isEmptyRunAbort,
  promptPatchForEmptyRun,
  stripEmptyRunFixAppendix,
} from "../../src/application/worker/empty-run-action.js";
import { EMPTY_RUN_EXIT_CODE } from "../../src/application/worker/empty-run-config.js";

describe("empty-run action", () => {
  it("detects abort marker", () => {
    expect(isEmptyRunAbort(EMPTY_RUN_EXIT_CODE, "[agent-farm] empty-run abort\n")).toBe(true);
    expect(isEmptyRunAbort(1, "[agent-farm] empty-run abort\n")).toBe(false);
  });

  it("strips and appends fix block", () => {
    const p = `do work\n\n[empty-run-fix]\nold`;
    expect(stripEmptyRunFixAppendix(p)).toBe("do work");
    expect(promptPatchForEmptyRun(10)).toContain("10 分钟");
  });
});
