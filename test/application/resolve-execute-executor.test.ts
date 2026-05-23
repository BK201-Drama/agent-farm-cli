import { describe, expect, it } from "vitest";
import { resolveExecuteExecutor, resolveExecutorId } from "../../src/application/executors/resolve-execute-executor.js";
import { CURSOR_SDK_EXECUTOR_ID } from "../../src/infrastructure/executors/cursor-sdk-executor.js";
import { SHELL_TEMPLATE_EXECUTOR_ID } from "../../src/application/executors/shell-template-executor.js";

describe("resolveExecutorId", () => {
  it("prefers task.executor over config and env", () => {
    const prev = process.env.AGENT_FARM_EXECUTOR;
    process.env.AGENT_FARM_EXECUTOR = "opencode";
    try {
      expect(resolveExecutorId({ executor: "cursor-sdk" }, { executor: "shell-template" })).toBe("cursor-sdk");
    } finally {
      if (prev === undefined) delete process.env.AGENT_FARM_EXECUTOR;
      else process.env.AGENT_FARM_EXECUTOR = prev;
    }
  });

  it("uses config.executor when task has none", () => {
    expect(resolveExecutorId({}, { executor: "cursor-sdk" })).toBe("cursor-sdk");
  });
});

describe("resolveExecuteExecutor", () => {
  it("returns cursor-sdk executor when configured", () => {
    const ex = resolveExecuteExecutor(
      {},
      "echo hi",
      {
        getTemplateContext: () => ({
          prompt: "p",
          task_id: "t",
          runs_dir: "/r",
          workspace: "/w",
          acceptance_criteria: "",
          git_diff: "",
          git_diff_name_status: "",
        }),
        runShell: async () => ({ exitCode: 0, output: "" }),
        env: {},
        onHeartbeat: async () => {},
        enableOpencodeStream: false,
      },
      { executor: "cursor-sdk" },
    );
    expect(ex.id).toBe(CURSOR_SDK_EXECUTOR_ID);
  });

  it("defaults to shell-template", () => {
    const ex = resolveExecuteExecutor(
      {},
      "echo hi",
      {
        getTemplateContext: () => ({
          prompt: "p",
          task_id: "t",
          runs_dir: "/r",
          workspace: "/w",
          acceptance_criteria: "",
          git_diff: "",
          git_diff_name_status: "",
        }),
        runShell: async () => ({ exitCode: 0, output: "" }),
        env: {},
        onHeartbeat: async () => {},
        enableOpencodeStream: false,
      },
      null,
    );
    expect(ex.id).toBe(SHELL_TEMPLATE_EXECUTOR_ID);
  });
});
