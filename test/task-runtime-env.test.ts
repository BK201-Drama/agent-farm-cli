import { describe, expect, it } from "vitest";
import { buildWorkerChildEnv } from "../src/application/worker/task-runtime-env.js";

describe("buildWorkerChildEnv", () => {
  it("sets AGENT_FARM_* and inherits process.env", () => {
    const env = buildWorkerChildEnv(
      { task_id: "tid", prompt: "hello" },
      "/runs",
      "/workspace"
    );
    expect(env.AGENT_FARM_TASK_ID).toBe("tid");
    expect(env.AGENT_FARM_RUNS_DIR).toBe("/runs");
    expect(env.AGENT_FARM_WORKSPACE).toBe("/workspace");
    expect(env.AGENT_FARM_PROMPT).toBe("hello");
    expect(env.PATH).toBeDefined();
    expect(env.PATH).toMatch(/node_modules[/\\].bin/);
    expect(String(env.PATH).startsWith("/workspace/node_modules/.bin")).toBe(true);
  });
});
