import { describe, expect, it } from "vitest";
import {
  buildTemplateContextFromTask,
  expandCommandTemplate,
} from "../../src/application/worker/command-template.js";

const defaultCtx = {
  prompt: "",
  task_id: "",
  runs_dir: "",
  workspace: "",
  acceptance_criteria: "",
  git_diff: "",
  git_diff_name_status: "",
};

describe("expandCommandTemplate", () => {
  it("embeds JSON-escaped prompt and acceptance_criteria", () => {
    const cmd = expandCommandTemplate(
      "echo {prompt} {task_id} {runs_dir} {workspace} {acceptance_criteria}",
      {
        ...defaultCtx,
        prompt: 'say "hi"',
        task_id: "t1",
        runs_dir: "/tmp/r",
        workspace: "/repo",
        acceptance_criteria: "must\npass",
      }
    );
    expect(cmd).toContain(JSON.stringify('say "hi"'));
    expect(cmd).toContain(JSON.stringify("must\npass"));
    expect(cmd).toContain("t1");
    expect(cmd).toContain("/tmp/r");
    expect(cmd).toContain("/repo");
  });

  it("replaces all placeholder occurrences", () => {
    const cmd = expandCommandTemplate("{task_id}-{task_id}", {
      ...defaultCtx,
      task_id: "x",
    });
    expect(cmd).toBe("x-x");
  });

  it("embeds JSON-escaped git_diff and git_diff_name_status", () => {
    const cmd = expandCommandTemplate(
      "cmd {git_diff} {git_diff_name_status}",
      {
        ...defaultCtx,
        git_diff: "diff --git a/foo\n+bar",
        git_diff_name_status: "M\tfoo.ts",
      }
    );
    expect(cmd).toContain(JSON.stringify("diff --git a/foo\n+bar"));
    expect(cmd).toContain(JSON.stringify("M\tfoo.ts"));
  });

  it("replaces all git_diff occurrences", () => {
    const cmd = expandCommandTemplate(
      "[{git_diff}] and {git_diff}",
      {
        ...defaultCtx,
        git_diff: "some diff",
      }
    );
    expect(cmd).toBe(`[${JSON.stringify("some diff")}] and ${JSON.stringify("some diff")}`);
  });
});

describe("buildTemplateContextFromTask", () => {
  it("reads fields from task record with empty git defaults", () => {
    const ctx = buildTemplateContextFromTask(
      { prompt: "p", task_id: "id", acceptance_criteria: "ac" },
      "/runs",
      "/ws"
    );
    expect(ctx).toEqual({
      prompt: "p",
      task_id: "id",
      runs_dir: "/runs",
      workspace: "/ws",
      acceptance_criteria: "ac",
      git_diff: "",
      git_diff_name_status: "",
      model: "",
    });
  });
});
