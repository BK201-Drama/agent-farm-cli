import { describe, expect, it } from "vitest";
import { runShellCommand } from "../../src/infrastructure/process/shell.js";

describe("runShellCommand timeout", () => {
  it("kills long-running child and returns exit 124 with marker", async () => {
    const cmd = process.platform === "win32" ? 'node -e "setTimeout(()=>{},120000)"' : "sleep 120";
    const t0 = Date.now();
    const r = await runShellCommand(cmd, { timeoutMs: 800 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(15_000);
    expect(r.exitCode).toBe(124);
    expect(r.output).toContain("[agent-farm] shell exceeded 800ms");
  }, 20_000);

  it("completes quickly without timeout when unset", async () => {
    const r = await runShellCommand(process.platform === "win32" ? 'node -e "process.exit(0)"' : "true");
    expect(r.exitCode).toBe(0);
  });
});
