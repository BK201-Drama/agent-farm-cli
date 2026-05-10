import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOpencodeRunProbeSkippedByEnv,
  probeOpencodeRunFormatJson,
} from "../../src/infrastructure/diagnostics/opencode-run-probe.js";

describe("opencode-run-probe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("isOpencodeRunProbeSkippedByEnv respects AGENT_FARM_SKIP_OPENCODE_PROBE", () => {
    vi.stubEnv("AGENT_FARM_SKIP_OPENCODE_PROBE", "");
    expect(isOpencodeRunProbeSkippedByEnv()).toBe(false);
    vi.stubEnv("AGENT_FARM_SKIP_OPENCODE_PROBE", "1");
    expect(isOpencodeRunProbeSkippedByEnv()).toBe(true);
  });

  it("probeOpencodeRunFormatJson does not spawn when skip env is set", () => {
    vi.stubEnv("AGENT_FARM_SKIP_OPENCODE_PROBE", "1");
    const r = probeOpencodeRunFormatJson("/nonexistent-workspace");
    expect(r.ok).toBe(true);
    expect(r.has_format_json).toBe(false);
    expect(r.message).toMatch(/skipped/i);
  });
});
