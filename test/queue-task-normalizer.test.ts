import { describe, expect, it } from "vitest";
import {
  assertNoDuplicateDedupeKey,
  normalizeQueuedTask,
} from "../src/application/queue/queue-task-normalizer.js";
import type { TaskRecord } from "../src/domain/task.js";

describe("normalizeQueuedTask", () => {
  it("applies defaults then spreads input", () => {
    const t = normalizeQueuedTask({ task_id: "a1", prompt: "x" });
    expect(t.task_id).toBe("a1");
    expect(t.topic).toBe("general");
    expect(t.mode).toBe("execute");
    expect(t.prompt).toBe("x");
    expect(t.status).toBe("queued");
    expect(t.created_at).toBeDefined();
  });

  it("lets caller override mode and topic", () => {
    const t = normalizeQueuedTask({ task_id: "p", mode: "plan", topic: "auth" });
    expect(t.mode).toBe("plan");
    expect(t.topic).toBe("auth");
  });
});

describe("assertNoDuplicateDedupeKey", () => {
  it("no-ops when dedupe key empty", () => {
    expect(() =>
      assertNoDuplicateDedupeKey([{ task_id: "1", status: "queued", dedupe_key: "" }], "")
    ).not.toThrow();
  });

  it("throws when another active task has same dedupe_key", () => {
    const rows: TaskRecord[] = [
      { task_id: "1", status: "running", dedupe_key: "k1" },
      { task_id: "2", status: "done", dedupe_key: "k1" },
    ];
    expect(() => assertNoDuplicateDedupeKey(rows, "k1")).toThrow(/duplicate dedupe_key/);
  });

  it("allows same key on non-active task", () => {
    const rows: TaskRecord[] = [{ task_id: "2", status: "done", dedupe_key: "k1" }];
    expect(() => assertNoDuplicateDedupeKey(rows, "k1")).not.toThrow();
  });
});
