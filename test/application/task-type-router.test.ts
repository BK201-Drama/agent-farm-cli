import { describe, it, expect } from "vitest";
import { createTaskTypeRouter, isValidTaskType, TASK_TYPES } from "../../src/application/executors/task-type-router.js";
import type { TaskTypeRouteOverride } from "../../src/application/contracts/agent-farm-project-config.js";

describe("isValidTaskType", () => {
  it("returns true for valid task types", () => {
    expect(isValidTaskType("code_gen")).toBe(true);
    expect(isValidTaskType("doc_gen")).toBe(true);
    expect(isValidTaskType("test_gen")).toBe(true);
    expect(isValidTaskType("code_review")).toBe(true);
    expect(isValidTaskType("migration")).toBe(true);
    expect(isValidTaskType("i18n")).toBe(true);
    expect(isValidTaskType("refactor")).toBe(true);
  });

  it("returns false for invalid task types", () => {
    expect(isValidTaskType("invalid")).toBe(false);
    expect(isValidTaskType("")).toBe(false);
    expect(isValidTaskType("codegen")).toBe(false);
  });
});

describe("createTaskTypeRouter", () => {
  const router = createTaskTypeRouter();

  it("returns all 7 task types", () => {
    expect(router.listTypes()).toEqual(TASK_TYPES);
    expect(router.listTypes()).toHaveLength(7);
  });

  it("routes code_gen with lint_test verify strategy", () => {
    const route = router.route("code_gen");
    expect(route.verify_strategy).toBe("lint_test");
  });

  it("routes doc_gen with gpt-4o-mini default and diff_only", () => {
    const route = router.route("doc_gen");
    expect(route.default_model).toBe("gpt-4o-mini");
    expect(route.verify_strategy).toBe("diff_only");
    expect(route.default_executor).toBe("shell-template");
  });

  it("routes code_review with readonly verify", () => {
    const route = router.route("code_review");
    expect(route.verify_strategy).toBe("readonly");
  });

  it("routes migration with lint_test", () => {
    const route = router.route("migration");
    expect(route.verify_strategy).toBe("lint_test");
  });

  it("routes i18n with gpt-4o-mini default", () => {
    const route = router.route("i18n");
    expect(route.default_model).toBe("gpt-4o-mini");
    expect(route.default_executor).toBe("shell-template");
  });

  it("allows overrides to change default_model", () => {
    const overrides: TaskTypeRouteOverride = { default_model: "claude-opus" };
    const route = router.route("doc_gen", overrides);
    expect(route.default_model).toBe("claude-opus");
    // Other fields should remain unchanged
    expect(route.verify_strategy).toBe("diff_only");
  });

  it("allows overrides to change verify_strategy", () => {
    const overrides: TaskTypeRouteOverride = { verify_strategy: "lint_test" };
    const route = router.route("doc_gen", overrides);
    expect(route.verify_strategy).toBe("lint_test");
  });

  it("each route returns a new object (no mutation)", () => {
    const r1 = router.route("doc_gen");
    const r2 = router.route("doc_gen");
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });
});
