import { describe, expect, it } from "vitest";
import {
  claimTasksFromRows,
  partitionPoisonQuarantine,
  recoverStaleInRows,
} from "../../../src/domain/task/board.js";
import type { TaskRecord } from "../../../src/domain/task/model.js";

const CLAIM_TIME = "2025-01-01T00:00:00.000Z";
const CLAIMANT = "test-claimant";

describe("claimTasksFromRows", () => {
  it("claims queued and retry tasks only", () => {
    const rows: TaskRecord[] = [
      { task_id: "done", status: "done" },
      { task_id: "running", status: "running" },
      { task_id: "queued", status: "queued" },
      { task_id: "retry", status: "retry" },
    ];
    const { claimed } = claimTasksFromRows(rows, 10, CLAIM_TIME, CLAIMANT);
    expect(claimed.map((x) => x.task_id)).toEqual(["queued", "retry"]);
  });

  it("sorts by priority descending", () => {
    const rows: TaskRecord[] = [
      { task_id: "p0", status: "queued", priority: 0, created_at: "2025-01-01T00:00:00.000Z" },
      { task_id: "p10", status: "queued", priority: 10, created_at: "2025-01-01T00:00:01.000Z" },
      { task_id: "p5", status: "queued", priority: 5, created_at: "2025-01-01T00:00:02.000Z" },
    ];
    const { claimed } = claimTasksFromRows(rows, 3, CLAIM_TIME, CLAIMANT);
    expect(claimed.map((x) => x.task_id)).toEqual(["p10", "p5", "p0"]);
  });

  it("sorts by created_at ascending when priorities equal", () => {
    const rows: TaskRecord[] = [
      { task_id: "later", status: "queued", priority: 5, created_at: "2025-01-02T00:00:00.000Z" },
      { task_id: "earlier", status: "queued", priority: 5, created_at: "2025-01-01T00:00:00.000Z" },
    ];
    const { claimed } = claimTasksFromRows(rows, 2, CLAIM_TIME, CLAIMANT);
    expect(claimed.map((x) => x.task_id)).toEqual(["earlier", "later"]);
  });

  it("sorts by priority desc then created_at asc together", () => {
    const rows: TaskRecord[] = [
      { task_id: "a", status: "queued", priority: 5, created_at: "2025-01-02T00:00:00.000Z" },
      { task_id: "b", status: "queued", priority: 10, created_at: "2025-01-03T00:00:00.000Z" },
      { task_id: "c", status: "queued", priority: 5, created_at: "2025-01-01T00:00:00.000Z" },
      { task_id: "d", status: "queued", priority: 10, created_at: "2025-01-01T00:00:00.000Z" },
    ];
    const { claimed } = claimTasksFromRows(rows, 4, CLAIM_TIME, CLAIMANT);
    expect(claimed.map((x) => x.task_id)).toEqual(["d", "b", "c", "a"]);
  });

  it("respects limit", () => {
    const rows: TaskRecord[] = [
      { task_id: "a", status: "queued" },
      { task_id: "b", status: "queued" },
      { task_id: "c", status: "queued" },
    ];
    const { claimed } = claimTasksFromRows(rows, 2, CLAIM_TIME, CLAIMANT);
    expect(claimed).toHaveLength(2);
    expect(claimed.map((x) => x.task_id)).toEqual(["a", "b"]);
  });

  it("handles empty array", () => {
    const { rows, claimed } = claimTasksFromRows([], 10, CLAIM_TIME, CLAIMANT);
    expect(rows).toHaveLength(0);
    expect(claimed).toHaveLength(0);
  });

  it("handles all tasks already claimed", () => {
    const rows: TaskRecord[] = [
      { task_id: "a", status: "claimed" },
      { task_id: "b", status: "running" },
    ];
    const { claimed } = claimTasksFromRows(rows, 10, CLAIM_TIME, CLAIMANT);
    expect(claimed).toHaveLength(0);
  });

  it("sorts queued and retry together", () => {
    const rows: TaskRecord[] = [
      { task_id: "retry-p0", status: "retry", priority: 0, created_at: "2025-01-01T00:00:00.000Z" },
      { task_id: "queued-p5", status: "queued", priority: 5, created_at: "2025-01-01T00:00:01.000Z" },
      { task_id: "retry-p10", status: "retry", priority: 10, created_at: "2025-01-01T00:00:02.000Z" },
    ];
    const { claimed } = claimTasksFromRows(rows, 3, CLAIM_TIME, CLAIMANT);
    expect(claimed.map((x) => x.task_id)).toEqual(["retry-p10", "queued-p5", "retry-p0"]);
  });

  it("marks claimed tasks with claimant info", () => {
    const rows: TaskRecord[] = [{ task_id: "a", status: "queued" }];
    const { claimed } = claimTasksFromRows(rows, 1, CLAIM_TIME, CLAIMANT);
    expect(claimed[0]?.status).toBe("claimed");
    expect(claimed[0]?.claimed_by).toBe(CLAIMANT);
    expect(claimed[0]?.claimed_at).toBe(CLAIM_TIME);
  });
});

describe("recoverStaleInRows", () => {
  const now = new Date("2025-01-01T12:00:00.000Z").getTime();

  it("recovers running tasks past lease timeout", () => {
    const staleTime = new Date(now - 2000 * 1000).toISOString();
    const rows: TaskRecord[] = [
      { task_id: "stale", status: "running", heartbeat_at: staleTime, attempt: 1 },
    ];
    const { recoveredIds, rows: next } = recoverStaleInRows(rows, 1800, now, "RECOVERED");
    expect(recoveredIds).toEqual(["stale"]);
    expect(next[0]?.status).toBe("retry");
    expect(next[0]?.attempt).toBe(2);
    expect(next[0]?.last_error).toMatch(/lease timeout/);
    expect(next[0]?.recovered_at).toBe("RECOVERED");
  });

  it("ignores running tasks within lease timeout", () => {
    const freshTime = new Date(now - 60 * 1000).toISOString();
    const rows: TaskRecord[] = [
      { task_id: "fresh", status: "running", heartbeat_at: freshTime, attempt: 1 },
    ];
    const { recoveredIds } = recoverStaleInRows(rows, 1800, now, "RECOVERED");
    expect(recoveredIds).toHaveLength(0);
  });

  it("ignores non-running tasks", () => {
    const oldTime = new Date(now - 2000 * 1000).toISOString();
    const rows: TaskRecord[] = [
      { task_id: "queued", status: "queued", created_at: oldTime },
      { task_id: "done", status: "done", created_at: oldTime },
      { task_id: "claimed", status: "claimed", claimed_at: oldTime },
    ];
    const { recoveredIds } = recoverStaleInRows(rows, 1800, now, "RECOVERED");
    expect(recoveredIds).toHaveLength(0);
  });

  it("handles missing heartbeat_at (falls back to started_at)", () => {
    const staleTime = new Date(now - 2000 * 1000).toISOString();
    const rows: TaskRecord[] = [
      { task_id: "no-heartbeat", status: "running", started_at: staleTime, attempt: 0 },
    ];
    const { recoveredIds } = recoverStaleInRows(rows, 1800, now, "RECOVERED");
    expect(recoveredIds).toEqual(["no-heartbeat"]);
  });

  it("handles empty array", () => {
    const { recoveredIds, rows } = recoverStaleInRows([], 1800, now, "RECOVERED");
    expect(recoveredIds).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });
});

describe("partitionPoisonQuarantine", () => {
  const blockedAt = "2025-01-01T00:00:00.000Z";

  it("blocks retry tasks at max attempts", () => {
    const rows: TaskRecord[] = [
      { task_id: "poison", status: "retry", attempt: 3 },
    ];
    const { keep, blocked } = partitionPoisonQuarantine(rows, 3, blockedAt);
    expect(keep).toHaveLength(0);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.status).toBe("blocked");
    expect(blocked[0]?.blocked_reason).toMatch(/poison threshold/);
  });

  it("blocks failed tasks at max attempts", () => {
    const rows: TaskRecord[] = [
      { task_id: "poison-failed", status: "failed", attempt: 5 },
    ];
    const { keep, blocked } = partitionPoisonQuarantine(rows, 3, blockedAt);
    expect(keep).toHaveLength(0);
    expect(blocked).toHaveLength(1);
  });

  it("keeps retry tasks below max attempts", () => {
    const rows: TaskRecord[] = [
      { task_id: "ok", status: "retry", attempt: 2 },
    ];
    const { keep, blocked } = partitionPoisonQuarantine(rows, 3, blockedAt);
    expect(keep).toHaveLength(1);
    expect(keep[0]?.task_id).toBe("ok");
    expect(blocked).toHaveLength(0);
  });

  it("keeps non-retry/failed statuses regardless of attempts", () => {
    const rows: TaskRecord[] = [
      { task_id: "queued", status: "queued", attempt: 10 },
      { task_id: "running", status: "running", attempt: 10 },
      { task_id: "done", status: "done", attempt: 10 },
    ];
    const { keep, blocked } = partitionPoisonQuarantine(rows, 3, blockedAt);
    expect(keep).toHaveLength(3);
    expect(blocked).toHaveLength(0);
  });

  it("handles empty array", () => {
    const { keep, blocked } = partitionPoisonQuarantine([], 3, blockedAt);
    expect(keep).toHaveLength(0);
    expect(blocked).toHaveLength(0);
  });

  it("sets blocked_at on isolated tasks", () => {
    const rows: TaskRecord[] = [
      { task_id: "poison", status: "retry", attempt: 5 },
    ];
    const { blocked } = partitionPoisonQuarantine(rows, 3, blockedAt);
    expect(blocked[0]?.blocked_at).toBe(blockedAt);
  });

  it("does not modify original rows", () => {
    const rows: TaskRecord[] = [
      { task_id: "poison", status: "retry", attempt: 5 },
      { task_id: "ok", status: "retry", attempt: 1 },
    ];
    partitionPoisonQuarantine(rows, 3, blockedAt);
    expect(rows[0]?.status).toBe("retry");
    expect(rows[1]?.status).toBe("retry");
  });
});