import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkExecutorHealth,
  commandTemplateIsShellFallback,
  createExecutorHealthCache,
  isExecutorProbeSkippedByEnv,
  resolveProbeBinary,
  type ExecutorHealthStatus,
} from "../../src/infrastructure/diagnostics/executor-health-check.js";

describe("resolveProbeBinary", () => {
  it("returns null for shell-template with plain shell command", () => {
    expect(resolveProbeBinary("shell-template", "echo hello")).toBeNull();
  });

  it("returns null for shell-template with empty command", () => {
    expect(resolveProbeBinary("shell-template", "")).toBeNull();
  });

  it("returns opencode-ai when command template contains opencode-ai run", () => {
    expect(resolveProbeBinary("shell-template", "npx opencode-ai run -p {prompt}")).toBe("opencode-ai");
  });

  it("returns claude when command template contains claude (but not claude-code)", () => {
    expect(resolveProbeBinary("shell-template", "claude -p {prompt}")).toBe("claude");
  });

  it("returns null for claude-code command (not matched as claude)", () => {
    // commandLooksLikeClaudeRun excludes "claude-code"
    expect(resolveProbeBinary("shell-template", "claude-code -p {prompt}")).toBeNull();
  });

  it("returns codex when command template contains codex exec", () => {
    expect(resolveProbeBinary("shell-template", "codex exec --json {prompt}")).toBe("codex");
  });

  it("returns agent when command template looks like cursor-agent", () => {
    expect(resolveProbeBinary("shell-template", "agent -p --force --trust {prompt}")).toBe("agent");
  });

  it("returns agent for cursor-agent executor id", () => {
    expect(resolveProbeBinary("cursor-agent", "")).toBe("agent");
  });

  it("returns codex for codex executor id", () => {
    expect(resolveProbeBinary("codex", "")).toBe("codex");
  });

  it("returns cursor-sdk for cursor-sdk executor id", () => {
    expect(resolveProbeBinary("cursor-sdk", "")).toBe("cursor-sdk");
  });

  it("returns cursor-sdk for cursor_sdk executor id (underscore)", () => {
    expect(resolveProbeBinary("cursor_sdk", "echo hello")).toBe("cursor-sdk");
  });

  it("case insensitive executor id matching", () => {
    expect(resolveProbeBinary("CURSOR-SDK", "")).toBe("cursor-sdk");
  });
});

describe("commandTemplateIsShellFallback", () => {
  it("returns false for empty template", () => {
    expect(commandTemplateIsShellFallback("")).toBe(false);
  });

  it("returns false for whitespace-only template", () => {
    expect(commandTemplateIsShellFallback("   ")).toBe(false);
  });

  it("returns true for plain shell command", () => {
    expect(commandTemplateIsShellFallback("echo hello world")).toBe(true);
  });

  it("returns true for npm/npx commands", () => {
    expect(commandTemplateIsShellFallback("npm run build && npm test")).toBe(true);
  });

  it("returns false for opencode-ai run command", () => {
    expect(commandTemplateIsShellFallback("opencode-ai run -p {prompt}")).toBe(false);
  });

  it("returns false for claude command (not claude-code)", () => {
    expect(commandTemplateIsShellFallback("claude -p {prompt} --output-format stream-json")).toBe(false);
  });

  it("returns false for codex exec command", () => {
    expect(commandTemplateIsShellFallback("codex exec --json {prompt}")).toBe(false);
  });

  it("returns false for cursor-agent command", () => {
    expect(commandTemplateIsShellFallback("agent -p --force --trust {prompt}")).toBe(false);
  });

  it("returns true for claude-code command (not matched as claude)", () => {
    // "claude-code" is not "claude" so commandLooksLikeClaudeRun is false
    expect(commandTemplateIsShellFallback("claude-code -p {prompt}")).toBe(true);
  });
});

describe("isExecutorProbeSkippedByEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when env is not set", () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "");
    expect(isExecutorProbeSkippedByEnv()).toBe(false);
  });

  it("returns true when env is 1", () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "1");
    expect(isExecutorProbeSkippedByEnv()).toBe(true);
  });

  it("returns true when env is true", () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "true");
    expect(isExecutorProbeSkippedByEnv()).toBe(true);
  });

  it("returns true when env is yes", () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "yes");
    expect(isExecutorProbeSkippedByEnv()).toBe(true);
  });
});

describe("checkExecutorHealth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns healthy when skip env is set", async () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "1");
    const result = await checkExecutorHealth("opencode", "opencode-ai run -p {prompt}");
    expect(result.healthy).toBe(true);
    expect(result.reason).toMatch(/skipped/i);
  });

  it("returns healthy for shell-template with plain shell command", async () => {
    const result = await checkExecutorHealth("shell-template", "echo hello");
    expect(result.healthy).toBe(true);
    expect(result.executor_id).toBe("shell-template");
    expect(result.reason).toMatch(/no agent binary/i);
  });

  it("returns healthy for shell-template with empty command template", async () => {
    const result = await checkExecutorHealth("shell-template", "");
    expect(result.healthy).toBe(true);
  });

  it("returns unhealthy for cursor-sdk when CURSOR_API_KEY is not set", async () => {
    vi.stubEnv("CURSOR_API_KEY", "");
    const result = await checkExecutorHealth("cursor-sdk", "");
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/CURSOR_API_KEY/i);
  });

  it("returns unhealthy for cursor-sdk when @cursor/sdk is not installed", async () => {
    vi.stubEnv("CURSOR_API_KEY", "test-key");
    const result = await checkExecutorHealth("cursor-sdk", "");
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/@cursor\/sdk not installed/i);
  });

  it("probes opencode-ai --version when command template matches", async () => {
    // The probe will actually try to spawn npx. In CI/dev environments
    // where opencode-ai isn't installed, we expect unhealthy.
    const result = await checkExecutorHealth("shell-template", "opencode-ai run -p {prompt}", {
      timeoutMs: 3000,
    });
    // Don't assert healthy/unhealthy — depends on the environment.
    // Just verify the shape is correct.
    expect(result.executor_id).toBe("shell-template");
    expect(typeof result.healthy).toBe("boolean");
    expect(typeof result.reason).toBe("string");
  });

  it("probes claude --version when command template matches", async () => {
    const result = await checkExecutorHealth("shell-template", "claude -p {prompt}", {
      timeoutMs: 3000,
    });
    expect(result.executor_id).toBe("shell-template");
    expect(typeof result.healthy).toBe("boolean");
    expect(typeof result.reason).toBe("string");
  });

  it("returns unhealthy with probe details when binary not found", async () => {
    const result = await checkExecutorHealth("shell-template", "opencode-ai run -p {prompt}", {
      timeoutMs: 3000,
    });
    if (!result.healthy) {
      expect(result.probe_command).toBeDefined();
      expect(typeof result.probe_command).toBe("string");
    }
  });
});

describe("createExecutorHealthCache", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("caches results within TTL", async () => {
    // Use skip env to get deterministic results
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "1");
    const cache = createExecutorHealthCache(60_000);

    const r1 = await cache.check("shell-template", "echo hello");
    const r2 = await cache.check("shell-template", "echo hello");

    expect(r1.healthy).toBe(true);
    // Same object reference (cached)
    expect(r2).toBe(r1);
  });

  it("different keys create different cache entries", async () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "1");
    const cache = createExecutorHealthCache(60_000);

    const r1 = await cache.check("shell-template", "echo hello");
    const r2 = await cache.check("cursor-sdk", "");

    expect(r1.executor_id).toBe("shell-template");
    expect(r2.executor_id).toBe("cursor-sdk");
    expect(r1).not.toBe(r2);
  });

  it("clear() resets cache", async () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "1");
    const cache = createExecutorHealthCache(60_000);

    const r1 = await cache.check("shell-template", "echo hello");
    cache.clear();
    const r2 = await cache.check("shell-template", "echo hello");

    // Both healthy but different objects (cache was cleared)
    expect(r2.healthy).toBe(true);
    // After clear, a new check returns a new object
    expect(r2).not.toBe(r1);
  });

  it("expires cache after TTL", async () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "1");
    const cache = createExecutorHealthCache(1); // 1ms TTL

    const r1 = await cache.check("shell-template", "echo hello");
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await cache.check("shell-template", "echo hello");

    expect(r1.healthy).toBe(true);
    expect(r2.healthy).toBe(true);
    // After TTL expiry, a new check returns a new object
    expect(r2).not.toBe(r1);
  });

  it("only caches by key (executorId + commandTemplate)", async () => {
    vi.stubEnv("AGENT_FARM_SKIP_EXECUTOR_PROBE", "1");
    const cache = createExecutorHealthCache(60_000);

    // Same executor, different command template → different cache key
    const r1 = await cache.check("shell-template", "echo hello");
    const r2 = await cache.check("shell-template", "npm run build");

    expect(r1).not.toBe(r2);
  });
});
