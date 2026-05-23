import { describe, it, expect } from "vitest";
import {
  enrichTaskWithTypeRoute,
  shouldSkipVerify,
  getVerifyStrategy,
} from "../../src/application/worker/task-type-enrich.js";
import type { AgentFarmProjectConfig } from "../../src/application/contracts/agent-farm-project-config.js";

describe("enrichTaskWithTypeRoute", () => {
  it("returns null when task has no task_type", () => {
    const task = { task_id: "t1", prompt: "do something" };
    expect(enrichTaskWithTypeRoute(task)).toBeNull();
  });

  it("returns null for invalid task_type", () => {
    const task = { task_id: "t1", task_type: "invalid_type", prompt: "x" };
    expect(enrichTaskWithTypeRoute(task)).toBeNull();
  });

  it("appends prompt_suffix for doc_gen", () => {
    const task: Record<string, unknown> = {
      task_id: "t1",
      task_type: "doc_gen",
      prompt: "生成 API 文档",
    };
    const route = enrichTaskWithTypeRoute(task);
    expect(route).not.toBeNull();
    expect(String(task.prompt)).toContain("生成 API 文档");
    expect(String(task.prompt)).toContain("Markdown");
    expect(String(task.prompt)).toContain("不要修改任何源代码");
    expect(task._verify_strategy).toBe("diff_only");
    expect(task._prompt_suffix_applied).toBe(true);
  });

  it("sets lint_test verify_strategy for code_gen", () => {
    const task: Record<string, unknown> = {
      task_id: "t1",
      task_type: "code_gen",
      prompt: "implement feature",
    };
    enrichTaskWithTypeRoute(task);
    expect(task._verify_strategy).toBe("lint_test");
  });

  it("sets readonly verify_strategy for code_review", () => {
    const task: Record<string, unknown> = {
      task_id: "t1",
      task_type: "code_review",
      prompt: "review code",
    };
    enrichTaskWithTypeRoute(task);
    expect(task._verify_strategy).toBe("readonly");
  });

  it("does not double-append prompt_suffix", () => {
    const task: Record<string, unknown> = {
      task_id: "t1",
      task_type: "doc_gen",
      prompt: "生成文档",
    };
    enrichTaskWithTypeRoute(task);
    const afterFirst = String(task.prompt);
    enrichTaskWithTypeRoute(task);
    expect(task.prompt).toBe(afterFirst); // unchanged
  });

  it("applies config overrides for task_type route", () => {
    const cfg: AgentFarmProjectConfig = {
      task_types: {
        doc_gen: { default_model: "claude-opus", verify_strategy: "lint_test" },
      },
    };
    const task: Record<string, unknown> = {
      task_id: "t1",
      task_type: "doc_gen",
      prompt: "生成文档",
    };
    const route = enrichTaskWithTypeRoute(task, cfg);
    expect(route?.default_model).toBe("claude-opus");
    expect(task._verify_strategy).toBe("lint_test");
  });
});

describe("shouldSkipVerify", () => {
  it("returns false when no verify_strategy set", () => {
    expect(shouldSkipVerify({})).toBe(false);
  });

  it("returns false for lint_test strategy", () => {
    const task: Record<string, unknown> = { _verify_strategy: "lint_test" };
    expect(shouldSkipVerify(task)).toBe(false);
  });

  it("returns true for diff_only strategy", () => {
    const task: Record<string, unknown> = { _verify_strategy: "diff_only" };
    expect(shouldSkipVerify(task)).toBe(true);
  });

  it("returns true for readonly strategy", () => {
    const task: Record<string, unknown> = { _verify_strategy: "readonly" };
    expect(shouldSkipVerify(task)).toBe(true);
  });

  it("returns true for none strategy", () => {
    const task: Record<string, unknown> = { _verify_strategy: "none" };
    expect(shouldSkipVerify(task)).toBe(true);
  });
});

describe("getVerifyStrategy", () => {
  it("returns undefined when not set", () => {
    expect(getVerifyStrategy({})).toBeUndefined();
  });

  it("returns strategy string when set", () => {
    const task: Record<string, unknown> = { _verify_strategy: "diff_only" };
    expect(getVerifyStrategy(task)).toBe("diff_only");
  });
});
