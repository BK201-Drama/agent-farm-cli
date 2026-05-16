import { describe, expect, it } from "vitest";
import {
  buildTaskExecutorRunInput,
  enrichPromptWithReadPaths,
  readPathsFromTask,
} from "../../src/application/executors/task-executor-input.js";

describe("task-executor-input", () => {
  it("readPathsFromTask accepts array or string", () => {
    expect(readPathsFromTask({ read_paths: ["a.md", "src/"] })).toEqual(["a.md", "src/"]);
    expect(readPathsFromTask({ read_paths: "docs/, src/" })).toEqual(["docs/", "src/"]);
  });

  it("enrichPromptWithReadPaths appends block once", () => {
    const p = enrichPromptWithReadPaths("do work", ["README.md"]);
    expect(p).toContain("[read_paths]");
    expect(p).toContain("- README.md");
    expect(enrichPromptWithReadPaths(p, ["x"])).toBe(p);
  });

  it("buildTaskExecutorRunInput merges paths into prompt", () => {
    const input = buildTaskExecutorRunInput(
      { prompt: "task body", read_paths: ["src/foo.ts"] },
      "t1",
      "/ws",
      2,
    );
    expect(input.read_paths).toEqual(["src/foo.ts"]);
    expect(input.prompt).toContain("src/foo.ts");
    expect(input.workspace_dir).toBe("/ws");
    expect(input.attempt).toBe(2);
  });
});
