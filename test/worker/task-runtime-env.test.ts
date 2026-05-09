import { describe, expect, it } from "vitest";
import { buildWorkerChildEnv } from "../../src/application/worker/task-runtime-env.js";

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
    expect(env.AGENT_FARM_WORKSPACE_ROOT).toBe("/workspace");
    expect(env.AGENT_FARM_PROMPT).toBe("hello");
    expect(env.PATH).toBeDefined();
    expect(env.PATH).toMatch(/node_modules[/\\].bin/);
    expect(String(env.PATH).startsWith("/workspace/node_modules/.bin")).toBe(true);
  });

  it("uses workspaceRootForDeps for PATH and sets branch when provided", () => {
    const env = buildWorkerChildEnv(
      { task_id: "t1", prompt: "p" },
      "/runs",
      "/wt/task-1",
      "/main/repo",
      "agent-farm/t1",
    );
    expect(env.AGENT_FARM_WORKSPACE).toBe("/wt/task-1");
    expect(env.AGENT_FARM_WORKSPACE_ROOT).toBe("/main/repo");
    expect(env.AGENT_FARM_WORKTREE_BRANCH).toBe("agent-farm/t1");
    expect(String(env.PATH).startsWith("/main/repo/node_modules/.bin")).toBe(true);
  });

  it("sets OPENCODE_DB when opencodeDbAbsolutePath is provided", () => {
    const env = buildWorkerChildEnv({ task_id: "t1", prompt: "p" }, "/runs", "/ws", undefined, undefined, "C:\\tmp\\opencode\\t1.db");
    expect(env.OPENCODE_DB).toBe("C:\\tmp\\opencode\\t1.db");
  });
});
