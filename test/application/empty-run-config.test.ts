import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveEmptyRunConfig } from "../../src/application/worker/empty-run-config.js";

describe("resolveEmptyRunConfig", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  beforeEach(() => {
    delete process.env.AGENT_FARM_EMPTY_RUN;
    delete process.env.AGENT_FARM_EMPTY_RUN_GRACE_MINUTES;
    delete process.env.AGENT_FARM_EMPTY_RUN_MIN_OPENCODE_LINES;
    delete process.env.AGENT_FARM_EMPTY_RUN_MIN_TOOL_CALLS;
  });

  it("uses env defaults", () => {
    const c = resolveEmptyRunConfig(null, {});
    expect(c.enabled).toBe(true);
    expect(c.graceMinutes).toBe(5);
    expect(c.minAgentLines).toBe(1);
    expect(c.minToolCalls).toBe(1);
  });

  it("merges project and task overrides", () => {
    process.env.AGENT_FARM_EMPTY_RUN_GRACE_MINUTES = "15";
    const c = resolveEmptyRunConfig(
      { empty_run: { grace_minutes: 8, min_opencode_lines: 2, min_tool_calls: 3 } },
      { empty_run_grace_minutes: 5, empty_run_disabled: true, empty_run_min_tool_calls: 2 },
    );
    expect(c.enabled).toBe(false);
    expect(c.graceMinutes).toBe(5);
    expect(c.minAgentLines).toBe(2);
    expect(c.minToolCalls).toBe(2);
  });
});
