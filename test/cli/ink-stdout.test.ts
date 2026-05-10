import { describe, expect, it } from "vitest";
import {
  shouldForceInkFullTerminalRedraw,
  wrapStdoutForInkFullRedraw,
} from "../../src/interfaces/cli/tui/task-dashboard/ink-stdout.js";

describe("ink-stdout", () => {
  it("respects AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR override", () => {
    const orig = process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR;
    try {
      process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR = "1";
      expect(shouldForceInkFullTerminalRedraw()).toBe(true);
      process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR = "0";
      expect(shouldForceInkFullTerminalRedraw()).toBe(false);
    } finally {
      if (orig === undefined) delete process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR;
      else process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR = orig;
    }
  });

  it("wrapStdout leaves rows unchanged when force clear is off", () => {
    const orig = process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR;
    try {
      process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR = "0";
      const w = wrapStdoutForInkFullRedraw(process.stdout);
      expect(w.rows).toBe(process.stdout.rows);
    } finally {
      if (orig === undefined) delete process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR;
      else process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR = orig;
    }
  });

  it("wrapStdout reports rows=1 when force clear is on", () => {
    const orig = process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR;
    try {
      process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR = "1";
      const w = wrapStdoutForInkFullRedraw(process.stdout);
      expect(w.rows).toBe(1);
      expect(w.columns).toBe(process.stdout.columns);
    } finally {
      if (orig === undefined) delete process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR;
      else process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR = orig;
    }
  });
});
