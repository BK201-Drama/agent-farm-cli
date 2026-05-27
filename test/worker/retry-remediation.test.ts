import { describe, expect, it } from "vitest";
import {
  detectRemediations,
  detectRateLimit,
  rateLimitConcurrencyWarningMsg,
  runRemediation,
} from "../../src/application/worker/retry-remediation.js";
import type { AgentStreamObserver } from "../../src/domain/ports/agent-stream-observer.js";

function fakeObserver(snippets: { errorSnippets?: string[]; toolIssues?: string[] }): AgentStreamObserver {
  return {
    snapshot: () => ({ errorSnippets: [], toolIssues: [], ...snippets }),
  } as AgentStreamObserver;
}

describe("detectRemediations", () => {
  it("returns npm_install when exec output contains module not found", () => {
    const actions = detectRemediations(undefined, "Error: cannot find module 'foo'");
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe("npm_install");
  });

  it("returns npm_install when stream observer has error snippets", () => {
    const actions = detectRemediations(
      fakeObserver({ errorSnippets: ["npm ERR! missing module"] }),
      "",
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe("npm_install");
  });

  it("returns npm_install when first 2000 chars of execOut contain error", () => {
    const prefix = "x".repeat(100);
    const suffix = "y".repeat(500) + "cannot find module 'bar'";
    const actions = detectRemediations(undefined, prefix + suffix);
    expect(actions).toHaveLength(1);
  });

  it("returns empty when no patterns match", () => {
    const actions = detectRemediations(undefined, "all good here");
    expect(actions).toHaveLength(0);
  });

  it("returns empty with undefined stream observer", () => {
    expect(detectRemediations(undefined, "")).toHaveLength(0);
  });
});

describe("runRemediation", () => {
  it("runs npm install on npm_install action", async () => {
    let capturedCmd = "";
    const result = await runRemediation({ type: "npm_install", reason: "test" }, {
      cwd: "/ws",
      env: {},
      runShell: async (cmd) => {
        capturedCmd = cmd;
        return { exitCode: 0, output: "ok", stdout: "ok", stderr: "" };
      },
    });
    expect(result.ok).toBe(true);
    expect(capturedCmd).toContain("npm install");
    expect(capturedCmd).toContain("--no-audit");
  });

  it("returns ok=false for unknown action type", async () => {
    const result = await runRemediation({ type: "npm_install" as any, reason: "" }, {
      cwd: "/ws",
      env: {},
      runShell: async () => ({ exitCode: 0, output: "", stdout: "", stderr: "" }),
    });
    expect(result.ok).toBe(true);
  });
});

describe("detectRateLimit", () => {
  it("matches 429 in exec output", () => {
    expect(detectRateLimit(undefined, "HTTP 429 Too Many Requests")).toBe(true);
  });

  it("matches rate limit in stream observer error", () => {
    expect(detectRateLimit(
      fakeObserver({ errorSnippets: ["rate limit exceeded"] }),
      "",
    )).toBe(true);
  });

  it("matches throttl substring", () => {
    expect(detectRateLimit(undefined, "request throttled")).toBe(true);
  });

  it("returns false for normal output", () => {
    expect(detectRateLimit(undefined, "build successful")).toBe(false);
  });
});

describe("rateLimitConcurrencyWarningMsg", () => {
  it("includes reduction hint when env is set", () => {
    process.env.AGENT_FARM_RATE_LIMIT_CONCURRENCY_REDUCTION = "2";
    const msg = rateLimitConcurrencyWarningMsg();
    expect(msg).toContain("2");
    delete process.env.AGENT_FARM_RATE_LIMIT_CONCURRENCY_REDUCTION;
  });

  it("returns generic message when env not set", () => {
    delete process.env.AGENT_FARM_RATE_LIMIT_CONCURRENCY_REDUCTION;
    const msg = rateLimitConcurrencyWarningMsg();
    expect(msg).toContain("rate-limit detected");
    expect(msg).toContain("concurrency");
  });
});
