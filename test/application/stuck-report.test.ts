import { describe, expect, it } from "vitest";
import { buildStuckReport, stuckRiskBadgeFromTasks } from "../../src/application/facades/stuck-report.js";

describe("buildStuckReport", () => {
  it("maps stale_running to retry items", () => {
    const r = buildStuckReport({
      ok: true,
      stale_running: [{ task_id: "t1", age_seconds: 2000 }],
      stale_running_count: 1,
      heartbeat_missing_count: 0,
      duplicate_dedupe_keys_count: 0,
      review_overdue_count: 0,
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.suggested_action).toBe("retry");
    expect(r.retryable_count).toBe(1);
  });

  it("returns empty when doctor is clean", () => {
    const r = buildStuckReport({
      ok: true,
      stale_running_count: 0,
      heartbeat_missing_count: 0,
      duplicate_dedupe_keys_count: 0,
      review_overdue_count: 0,
    });
    expect(r.items).toHaveLength(0);
  });
});

describe("stuckRiskBadgeFromTasks", () => {
  it("shows badge for stale running", () => {
    const old = new Date(Date.now() - 3600_000).toISOString();
    const badge = stuckRiskBadgeFromTasks(
      [{ task_id: "a", status: "running", heartbeat_at: old }],
      1800,
    );
    expect(badge).toContain("stuck");
  });
});
