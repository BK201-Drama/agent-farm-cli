import { describe, expect, it } from "vitest";
import { buildControlPlaneHealth } from "../../src/application/facades/control-plane-health.js";

describe("buildControlPlaneHealth", () => {
  it("marks worker idle when queued but not running", () => {
    const h = buildControlPlaneHealth(
      "/proj",
      { ok: true, stale_running_count: 0, heartbeat_missing_count: 0 },
      { status_counts: { queued: 2, running: 0 } },
      { ok: true, items: [], retryable_count: 0, high_severity_count: 0 },
    );
    expect(h.worker_hint).toBe("idle");
    expect(h.counts.queued).toBe(2);
  });

  it("marks worker stalled when stale running", () => {
    const h = buildControlPlaneHealth(
      "/proj",
      { ok: true, stale_running_count: 1, heartbeat_missing_count: 0 },
      { status_counts: { running: 1 } },
      { ok: true, items: [{ kind: "x" } as never], retryable_count: 1, high_severity_count: 1 },
    );
    expect(h.worker_hint).toBe("stalled");
    expect(h.counts.stuck).toBe(1);
  });
});
