import { describe, expect, it } from "vitest";
import type { TaskRecord } from "../src/domain/task.js";
import { livenessIso, tasksFingerprint } from "../src/interfaces/cli/tui/task-dashboard/helpers.js";
import {
  computeDashboardViewports,
  DEFAULT_VIEWPORT_HIST,
  DEFAULT_VIEWPORT_PIPE,
} from "../src/interfaces/cli/tui/task-dashboard/viewport-plan.js";

describe("livenessIso (dashboard since column)", () => {
  it("prefers started_at over heartbeat_at for running tasks", () => {
    const t = {
      status: "running",
      started_at: "2020-01-01T00:00:00.000Z",
      heartbeat_at: "2026-05-07T12:00:00.000Z",
      claimed_at: "2019-12-31T00:00:00.000Z",
    } as TaskRecord;
    expect(livenessIso(t)).toBe("2020-01-01T00:00:00.000Z");
  });

  it("falls back to claimed_at when started_at missing", () => {
    const t = {
      status: "claimed",
      heartbeat_at: "2026-05-07T12:00:00.000Z",
      claimed_at: "2026-05-07T11:00:00.000Z",
    } as TaskRecord;
    expect(livenessIso(t)).toBe("2026-05-07T11:00:00.000Z");
  });

  it("falls back to heartbeat_at when started and claimed missing", () => {
    const t = {
      status: "running",
      heartbeat_at: "2026-05-07T12:00:00.000Z",
    } as TaskRecord;
    expect(livenessIso(t)).toBe("2026-05-07T12:00:00.000Z");
  });
});

describe("computeDashboardViewports", () => {
  it("falls back to defaults when terminal height unusable", () => {
    expect(
      computeDashboardViewports({
        terminalRows: 4,
        storageLineCount: 0,
        hasStatusCompact: false,
        hasLastOk: false,
        showStdinHint: false,
        hasLoadError: false,
      }),
    ).toEqual({ pipe: DEFAULT_VIEWPORT_PIPE, hist: DEFAULT_VIEWPORT_HIST });
  });

  it("shrinks pipeline/history viewports on short terminals", () => {
    const v = computeDashboardViewports({
      terminalRows: 22,
      storageLineCount: 2,
      hasStatusCompact: true,
      hasLastOk: true,
      showStdinHint: false,
      hasLoadError: false,
    });
    expect(v.pipe + v.hist).toBeLessThan(DEFAULT_VIEWPORT_PIPE + DEFAULT_VIEWPORT_HIST);
    expect(v.pipe).toBeGreaterThanOrEqual(2);
    expect(v.hist).toBeGreaterThanOrEqual(2);
  });
});

describe("tasksFingerprint", () => {
  it("ignores heartbeat_at-only changes (avoids pointless dashboard poll refresh)", () => {
    const base = {
      task_id: "t1",
      status: "running",
      prompt: "p",
      topic: "general",
      heartbeat_at: "2026-01-01T00:00:00.000Z",
    } as TaskRecord;
    const bumpedHb = { ...base, heartbeat_at: "2026-01-01T00:15:00.000Z" } as TaskRecord;
    expect(tasksFingerprint([base])).toBe(tasksFingerprint([bumpedHb]));
  });

  it("ignores updated_at / created_at-only changes in payload", () => {
    const base = {
      task_id: "t2",
      status: "done",
      prompt: "x",
      topic: "general",
      created_at: "2020-01-01T00:00:00.000Z",
    } as TaskRecord;
    const bumped = {
      ...base,
      updated_at: "2099-01-01T00:00:00.000Z",
      created_at: "2020-01-02T00:00:00.000Z",
    } as TaskRecord;
    expect(tasksFingerprint([base])).toBe(tasksFingerprint([bumped]));
  });
});
