import { describe, expect, it } from "vitest";
import {
  createShellTemplateExecutor,
  SHELL_TEMPLATE_EXECUTOR_ID,
} from "../../src/application/executors/shell-template-executor.js";

describe("createShellTemplateExecutor", () => {
  it("expands template and runs shell", async () => {
    const executor = createShellTemplateExecutor({
      commandTemplate: "echo {prompt}",
      getTemplateContext: () => ({
        prompt: "hello",
        task_id: "t1",
        runs_dir: "/runs",
        workspace: "/ws",
        acceptance_criteria: "",
        git_diff: "",
        git_diff_name_status: "",
      }),
      runShell: async () => ({ exitCode: 0, output: "ok" }),
      env: {},
      onHeartbeat: async () => {},
      enableOpencodeStream: false,
    });
    expect(executor.id).toBe(SHELL_TEMPLATE_EXECUTOR_ID);
    const result = await executor.run({
      task_id: "t1",
      prompt: "hello",
      workspace_dir: "/ws",
      attempt: 0,
    });
    expect(result.exit_code).toBe(0);
    expect(result.output).toBe("ok");
  });
});
