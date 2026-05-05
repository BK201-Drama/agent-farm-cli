import { describe, expect, it } from "vitest";
import { hasDuplicateActiveDedupe } from "../src/application/worker/task-dedupe.js";

describe("hasDuplicateActiveDedupe", () => {
  it("false when dedupe_key empty", () => {
    expect(hasDuplicateActiveDedupe({ task_id: "a", dedupe_key: "" }, [])).toBe(false);
  });

  it("true when another active task shares dedupe_key", () => {
    const all = [
      { task_id: "1", status: "running", dedupe_key: "k" },
      { task_id: "2", status: "queued", dedupe_key: "k" },
    ];
    expect(hasDuplicateActiveDedupe({ task_id: "2", dedupe_key: "k" }, all)).toBe(true);
  });

  it("false for same task_id only", () => {
    const all = [{ task_id: "1", status: "running", dedupe_key: "k" }];
    expect(hasDuplicateActiveDedupe({ task_id: "1", dedupe_key: "k" }, all)).toBe(false);
  });
});
