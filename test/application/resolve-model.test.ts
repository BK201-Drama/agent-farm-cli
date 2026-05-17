import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveModel, resolveModelFromContext, extractConfigModel } from "../../src/application/executors/resolve-model.js";
import type { AgentFarmProjectConfig } from "../../src/application/contracts/agent-farm-project-config.js";

describe("resolveModel", () => {
  it("returns undefined when all inputs are empty", () => {
    expect(resolveModel()).toBeUndefined();
    expect(resolveModel("", null, undefined)).toBeUndefined();
  });

  it("prioritizes taskModel over configModel and envModel", () => {
    expect(resolveModel("claude-opus", "gpt-4o-mini", "composer-2")).toBe("claude-opus");
  });

  it("falls back to configModel when taskModel is empty", () => {
    expect(resolveModel("", "gpt-4o-mini", "composer-2")).toBe("gpt-4o-mini");
    expect(resolveModel(null, "gpt-4o-mini", undefined)).toBe("gpt-4o-mini");
  });

  it("falls back to envModel when both taskModel and configModel are empty", () => {
    expect(resolveModel("", "", "composer-2")).toBe("composer-2");
    expect(resolveModel(undefined, null, "composer-2")).toBe("composer-2");
  });

  it("trims whitespace", () => {
    expect(resolveModel("  claude-opus  ")).toBe("claude-opus");
    expect(resolveModel("", "  gpt-4o  ")).toBe("gpt-4o");
  });

  it("returns undefined for whitespace-only strings", () => {
    expect(resolveModel("   ", "   ", "   ")).toBeUndefined();
  });
});

describe("extractConfigModel", () => {
  it("returns undefined for null/undefined config", () => {
    expect(extractConfigModel(null)).toBeUndefined();
    expect(extractConfigModel(undefined)).toBeUndefined();
  });

  it("returns undefined when executor is a string", () => {
    const cfg: AgentFarmProjectConfig = { executor: "cursor-sdk" };
    expect(extractConfigModel(cfg)).toBeUndefined();
  });

  it("returns model when executor is an object with model field", () => {
    const cfg: AgentFarmProjectConfig = { executor: { model: "claude-opus" } };
    expect(extractConfigModel(cfg)).toBe("claude-opus");
  });

  it("returns undefined when executor is an object without model field", () => {
    const cfg: AgentFarmProjectConfig = { executor: { id: "cursor-sdk" } };
    expect(extractConfigModel(cfg)).toBeUndefined();
  });
});

describe("resolveModelFromContext", () => {
  const origEnv = process.env.AGENT_FARM_MODEL;

  beforeEach(() => {
    delete process.env.AGENT_FARM_MODEL;
  });

  afterEach(() => {
    if (origEnv) process.env.AGENT_FARM_MODEL = origEnv;
    else delete process.env.AGENT_FARM_MODEL;
  });

  it("resolves from task.model first", () => {
    const task = { model: "gpt-4o" };
    const cfg: AgentFarmProjectConfig = { executor: { model: "claude-opus" } };
    process.env.AGENT_FARM_MODEL = "composer-2";
    expect(resolveModelFromContext(task, cfg)).toBe("gpt-4o");
  });

  it("resolves from config.executor.model when task.model is absent", () => {
    const task = {};
    const cfg: AgentFarmProjectConfig = { executor: { model: "claude-opus" } };
    expect(resolveModelFromContext(task, cfg)).toBe("claude-opus");
  });

  it("resolves from AGENT_FARM_MODEL env when task and config are absent", () => {
    const task = {};
    process.env.AGENT_FARM_MODEL = "composer-2";
    expect(resolveModelFromContext(task, null)).toBe("composer-2");
  });

  it("returns undefined when no source specifies a model", () => {
    const task = {};
    expect(resolveModelFromContext(task, null)).toBeUndefined();
  });
});
