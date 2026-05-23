import { afterEach, describe, expect, it, vi } from "vitest";
import { resetJsonlStorageWarnForTests, warnJsonlStorageIfNeeded } from "../../src/domain/task/storage-policy.js";

describe("warnJsonlStorageIfNeeded", () => {
  afterEach(() => {
    resetJsonlStorageWarnForTests();
    vi.restoreAllMocks();
  });

  it("warns once for jsonl", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnJsonlStorageIfNeeded("jsonl");
    warnJsonlStorageIfNeeded("jsonl");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/jsonl/);
  });

  it("silent for sqlite", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnJsonlStorageIfNeeded("sqlite");
    expect(warn).not.toHaveBeenCalled();
  });
});
