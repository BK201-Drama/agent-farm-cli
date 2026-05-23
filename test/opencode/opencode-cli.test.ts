import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOpencodeCliTimeoutMsFromEnv } from "../../src/infrastructure/opencode/opencode-cli.js";

describe("resolveOpencodeCliTimeoutMsFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 90s when unset or invalid", () => {
    vi.stubEnv("AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS", "");
    expect(resolveOpencodeCliTimeoutMsFromEnv()).toBe(90_000);

    vi.stubEnv("AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS", "abc");
    expect(resolveOpencodeCliTimeoutMsFromEnv()).toBe(90_000);

    vi.stubEnv("AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS", "500");
    expect(resolveOpencodeCliTimeoutMsFromEnv()).toBe(90_000);
  });

  it("clamps to 600s max when set", () => {
    vi.stubEnv("AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS", "999999");
    expect(resolveOpencodeCliTimeoutMsFromEnv()).toBe(600_000);

    vi.stubEnv("AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS", "10000");
    expect(resolveOpencodeCliTimeoutMsFromEnv()).toBe(10_000);
  });

  it("accepts valid timeout values", () => {
    vi.stubEnv("AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS", "3000");
    expect(resolveOpencodeCliTimeoutMsFromEnv()).toBe(3_000);

    vi.stubEnv("AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS", "120000");
    expect(resolveOpencodeCliTimeoutMsFromEnv()).toBe(120_000);
  });
});
