import { describe, expect, it } from "vitest";
import { createCursorSdkExecutor } from "../../src/infrastructure/executors/cursor-sdk-executor.js";

describe("createCursorSdkExecutor", () => {
  it("returns 127 when CURSOR_API_KEY missing", async () => {
    const prev = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    try {
      const ex = createCursorSdkExecutor();
      const result = await ex.run({
        task_id: "t1",
        prompt: "hello",
        workspace_dir: process.cwd(),
        attempt: 0,
      });
      expect(result.exit_code).toBe(127);
      expect(result.output).toMatch(/CURSOR_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.CURSOR_API_KEY = prev;
    }
  });
});
