import { describe, expect, it } from "vitest";
import { createCursorSdkExecutor } from "../../src/infrastructure/executors/cursor-sdk-executor.js";

const hasKey = Boolean(process.env.CURSOR_API_KEY?.trim());
const describeIfKey = hasKey ? describe : describe.skip;

describeIfKey("BDD: cursor-sdk smoke (需 CURSOR_API_KEY + @cursor/sdk)", () => {
  it("Given CURSOR_API_KEY When run smoke prompt Then exit 0", async () => {
    const ex = createCursorSdkExecutor();
    const result = await ex.run({
      task_id: "bdd-cursor-smoke",
      prompt: "Reply with exactly: AGENT_FARM_CURSOR_SDK_OK",
      workspace_dir: process.cwd(),
      attempt: 1,
    });
    if (result.exit_code === 127) {
      expect(result.output).toMatch(/@cursor\/sdk|CURSOR_API_KEY/);
      return;
    }
    expect(result.exit_code).toBe(0);
    expect(result.output).toMatch(/AGENT_FARM_CURSOR_SDK_OK|queue|farm/i);
  }, 120000);
});

describe("BDD: cursor-sdk without API key", () => {
  it("Given no CURSOR_API_KEY When run Then exit 127", async () => {
    const prev = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    try {
      const result = await createCursorSdkExecutor().run({
        task_id: "t",
        prompt: "x",
        workspace_dir: process.cwd(),
        attempt: 1,
      });
      expect(result.exit_code).toBe(127);
    } finally {
      if (prev !== undefined) process.env.CURSOR_API_KEY = prev;
    }
  });
});
