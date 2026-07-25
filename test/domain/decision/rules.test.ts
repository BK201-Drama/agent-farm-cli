import { describe, expect, it } from "vitest";
import { matchRules } from "../../../src/domain/decision/rules.js";
import type { DecisionRequest, DecisionRule } from "../../../src/domain/decision/model.js";

const DEFAULT_REQUEST: DecisionRequest = {
  task_id: "test-1",
  decision_id: "d-1",
  context: "Need to choose a database for persisting application data",
  options: ["SQLite", "PostgreSQL", "MongoDB"],
  recommendation: "SQLite",
  stage: "execute",
  attempt: 1,
};

const STORAGE_RULE: DecisionRule = {
  id: "storage-sqlite",
  description: "Use SQLite by default",
  context_patterns: ["database", "persist", "storage"],
  preferred_option: "SQLite",
  priority: 100,
};

const FRONTEND_RULE: DecisionRule = {
  id: "frontend-react",
  description: "Use React for frontend",
  context_patterns: ["frontend", "UI", "component"],
  option_patterns: ["React", "react"],
  preferred_option: "React",
  priority: 90,
};

const DEFAULT_CHOICE_RULE: DecisionRule = {
  id: "always-indexeddb",
  description: "Always use IndexedDB",
  context_patterns: ["indexeddb", "browser storage"],
  default_choice: "IndexedDB",
  priority: 50,
};

describe("matchRules", () => {
  it("returns null when rule base is empty", () => {
    expect(matchRules(DEFAULT_REQUEST, [])).toBeNull();
  });

  it("matches context_patterns via substring", () => {
    const result = matchRules(DEFAULT_REQUEST, [STORAGE_RULE]);
    expect(result).not.toBeNull();
    expect(result!.escalated).toBe(false);
    expect(result!.chosen).toBe("SQLite");
    expect(result!.resolved_by).toBe("rule");
    expect(result!.confidence).toBeGreaterThan(0);
  });

  it("returns null when no context_patterns match", () => {
    const result = matchRules(DEFAULT_REQUEST, [FRONTEND_RULE]);
    expect(result).toBeNull();
  });

  it("respects option_patterns filtering", () => {
    const request: DecisionRequest = {
      ...DEFAULT_REQUEST,
      context: "Need to pick a frontend framework for the UI components",
      options: ["Vue", "Svelte", "Angular"],
      recommendation: "Vue",
    };
    // FRONTEND_RULE has option_patterns: ["React", "react"] but options are Vue/Svelte/Angular
    const result = matchRules(request, [FRONTEND_RULE]);
    expect(result).toBeNull();
  });

  it("matches when option_patterns are satisfied", () => {
    const request: DecisionRequest = {
      ...DEFAULT_REQUEST,
      context: "Need a frontend framework for UI components",
      options: ["React", "Vue", "Angular"],
      recommendation: "Vue",
    };
    const result = matchRules(request, [FRONTEND_RULE]);
    expect(result).not.toBeNull();
    expect(result!.chosen).toBe("React");
  });

  it("uses default_choice when set", () => {
    const request: DecisionRequest = {
      ...DEFAULT_REQUEST,
      context: "Should I use IndexedDB for browser storage?",
    };
    const result = matchRules(request, [DEFAULT_CHOICE_RULE]);
    expect(result).not.toBeNull();
    expect(result!.chosen).toBe("IndexedDB");
  });

  it("sorts rules by priority (higher first)", () => {
    const lowPriority: DecisionRule = { ...STORAGE_RULE, id: "low", priority: 10, preferred_option: "PostgreSQL" };
    const highPriority: DecisionRule = { ...STORAGE_RULE, id: "high", priority: 100, preferred_option: "SQLite" };
    // context matches both, but high priority should win
    const result = matchRules(DEFAULT_REQUEST, [lowPriority, highPriority]);
    expect(result).not.toBeNull();
    expect(result!.chosen).toBe("SQLite");
    expect(result!.reason).toContain("high");
  });

  it("returns null when preferred_option is not in options", () => {
    const request: DecisionRequest = {
      ...DEFAULT_REQUEST,
      options: ["PostgreSQL", "MongoDB"], // no SQLite
    };
    const result = matchRules(request, [STORAGE_RULE]);
    // preferred_option "SQLite" not in options → rule doesn't apply
    expect(result).toBeNull();
  });

  it("falls back to recommendation when no preferred_option or default_choice", () => {
    const rule: DecisionRule = {
      id: "test",
      description: "test rule",
      context_patterns: ["choose", "test"],
      priority: 100,
    };
    const request: DecisionRequest = {
      ...DEFAULT_REQUEST,
      context: "choose a test framework",
      recommendation: "Vitest",
    };
    const result = matchRules(request, [rule]);
    expect(result).not.toBeNull();
    expect(result!.chosen).toBe("Vitest");
  });
});
