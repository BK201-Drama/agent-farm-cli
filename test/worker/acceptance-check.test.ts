import { describe, expect, it } from "vitest";
import { runAcceptanceCheck, stripVerifyFailAppendix } from "../../src/application/worker/acceptance-check.js";

const fakeRunShell = (exitCode: number, output: string) => async () => ({ exitCode, output, stdout: output, stderr: "" });

describe("runAcceptanceCheck", () => {
  it("returns passed=true when exit code is 0", async () => {
    const result = await runAcceptanceCheck("echo ok", {
      cwd: "/tmp",
      env: {},
      runShell: fakeRunShell(0, "ok\n"),
      timeoutMs: 5000,
    });
    expect(result.passed).toBe(true);
    expect(result.output).toBe("ok\n");
  });

  it("returns passed=false when exit code is non-zero", async () => {
    const result = await runAcceptanceCheck("false", {
      cwd: "/tmp",
      env: {},
      runShell: fakeRunShell(1, "failed\n"),
    });
    expect(result.passed).toBe(false);
  });

  it("wraps command with cd", async () => {
    let capturedCmd = "";
    const result = await runAcceptanceCheck("npm test", {
      cwd: "/workspace",
      env: {},
      runShell: async (cmd) => {
        capturedCmd = cmd;
        return { exitCode: 0, output: "", stdout: "", stderr: "" };
      },
    });
    expect(capturedCmd).toContain('cd "/workspace"');
    expect(capturedCmd).toContain("npm test");
  });

  it("uses default timeoutMs 120_000 when not provided", async () => {
    let capturedOpts: { timeoutMs?: number } | undefined;
    const result = await runAcceptanceCheck("ls", {
      cwd: "/tmp",
      env: {},
      runShell: async (_cmd, opts) => {
        capturedOpts = opts;
        return { exitCode: 0, output: "", stdout: "", stderr: "" };
      },
    });
    expect(capturedOpts?.timeoutMs).toBe(120_000);
  });
});

describe("stripVerifyFailAppendix", () => {
  it("removes [verify-fail] appendix from prompt", () => {
    const input = "implement login\n\n[verify-fail]\ntest output here\nmore lines";
    const result = stripVerifyFailAppendix(input);
    expect(result).toBe("implement login");
  });

  it("returns prompt unchanged when no appendix", () => {
    const input = "implement login\n\nwith details";
    expect(stripVerifyFailAppendix(input)).toBe("implement login\n\nwith details");
  });

  it("trims trailing whitespace", () => {
    const input = "prompt\n\n[verify-fail]\nfail output\n  ";
    expect(stripVerifyFailAppendix(input)).toBe("prompt");
  });
});
