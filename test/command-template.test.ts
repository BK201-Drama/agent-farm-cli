import { describe, expect, it } from "vitest";
import {
  buildTemplateContextFromTask,
  expandCommandTemplate,
} from "../src/application/worker/command-template.js";

describe("expandCommandTemplate", () => {
  it("embeds JSON-escaped prompt and acceptance_criteria", () => {
    const cmd = expandCommandTemplate(
      "echo {prompt} {task_id} {runs_dir} {workspace} {acceptance_criteria}",
      {
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
      prompt: "",
      task_id: "x",
      runs_dir: "",
      workspace: "",
      acceptance_criteria: "",
    });
    expect(cmd).toBe("x-x");
  });
});

describe("buildTemplateContextFromTask", () => {
  it("reads fields from task record", () => {
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
    });
  });
});
