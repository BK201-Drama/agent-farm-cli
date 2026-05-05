import { describe, expect, it } from "vitest";
import { assertNoDuplicateDedupeKey, normalizeQueuedTask } from "../src/domain/task/enqueue.js";
import {
  claimTasksFromRows,
  partitionPoisonQuarantine,
  recoverStaleInRows,
} from "../src/domain/task/board.js";
import type { TaskRecord } from "../src/domain/task/model.js";

const FIXED_NOW = "2020-01-01T00:00:00.000Z";

describe("normalizeQueuedTask", () => {
  it("applies defaults then spreads input", () => {
    const t = normalizeQueuedTask({ task_id: "a1", prompt: "x" }, FIXED_NOW);
    expect(t.task_id).toBe("a1");
    expect(t.topic).toBe("general");
    expect(t.mode).toBe("execute");
    expect(t.prompt).toBe("x");
    expect(t.status).toBe("queued");
    expect(t.created_at).toBe(FIXED_NOW);
  });

  it("lets caller override mode and topic", () => {
    const t = normalizeQueuedTask({ task_id: "p", mode: "plan", topic: "auth" }, FIXED_NOW);
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

describe("claimTasksFromRows", () => {
  it("claims queued then retry up to limit", () => {
    const rows: TaskRecord[] = [
      { task_id: "a", status: "done" },
      { task_id: "b", status: "queued" },
      { task_id: "c", status: "retry" },
    ];
    const { rows: next, claimed } = claimTasksFromRows(rows, 2, "T1");
    expect(claimed.map((x) => x.task_id)).toEqual(["b", "c"]);
    expect(next.find((x) => x.task_id === "b")?.status).toBe("claimed");
    expect(next.find((x) => x.task_id === "a")?.status).toBe("done");
  });
});

describe("recoverStaleInRows", () => {
  it("moves stale running to retry", () => {
    const old = new Date(Date.now() - 4000 * 1000).toISOString();
    const rows: TaskRecord[] = [
      { task_id: "r", status: "running", heartbeat_at: old, attempt: 0 },
    ];
    const { recoveredIds } = recoverStaleInRows(rows, 1800, Date.now(), "NOW");
    expect(recoveredIds).toEqual(["r"]);
  });
});

describe("partitionPoisonQuarantine", () => {
  it("splits poison rows", () => {
    const rows: TaskRecord[] = [
      { task_id: "ok", status: "queued", attempt: 0 },
      { task_id: "bad", status: "retry", attempt: 5 },
    ];
    const { keep, blocked } = partitionPoisonQuarantine(rows, 3, "B1");
    expect(keep.map((x) => x.task_id)).toEqual(["ok"]);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.task_id).toBe("bad");
    expect(blocked[0]?.status).toBe("blocked");
  });
});
