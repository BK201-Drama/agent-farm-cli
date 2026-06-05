/**
 * 模板解析器单元测试
 */
import { describe, expect, it } from "vitest";
import { resolveTemplate, mergeTemplates } from "../../src/application/template/template-resolver.js";
import { BUILTIN_TEMPLATES } from "../../src/application/template/builtin-templates.js";
import type { TaskTemplate } from "../../src/application/template/template-resolver.js";

describe("BUILTIN_TEMPLATES", () => {
  it("has 5 built-in templates", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(5);
  });

  it("all templates have required fields", () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.id, `${t.id} has id`).toBeTruthy();
      expect(t.prompt_template, `${t.id} has prompt_template`).toBeTruthy();
      expect(t.acceptance_template, `${t.id} has acceptance_template`).toBeTruthy();
    }
  });

  it("all template IDs are unique", () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveTemplate", () => {
  const tpl: TaskTemplate = {
    id: "test",
    label: "Test",
    description: "Test template",
    task_type: "code_gen",
    mode: "execute",
    prompt_template: "Fix bug in {file}: {symptom}",
    required_fields: ["file", "symptom"],
    optional_fields: ["hint"],
    acceptance_template: "Tests pass for {file}",
  };

  it("resolves all placeholders", () => {
    const result = resolveTemplate(tpl, {
      file: "src/foo.ts",
      symptom: "NullPointerException",
    });
    expect(result.prompt).toBe("Fix bug in src/foo.ts: NullPointerException");
    expect(result.acceptance_criteria).toBe("Tests pass for src/foo.ts");
    expect(result.errors).toEqual([]);
  });

  it("includes optional fields when provided", () => {
    const result = resolveTemplate(tpl, {
      file: "src/bar.ts",
      symptom: "TypeError",
      hint: "check line 42",
    });
    expect(result.prompt).toBe("Fix bug in src/bar.ts: TypeError");
  });

  it("reports missing required fields", () => {
    const result = resolveTemplate(tpl, { file: "src/foo.ts" });
    expect(result.errors).toContain("缺少必需字段: symptom");
  });

  it("reports unreplaced placeholders", () => {
    const result = resolveTemplate(tpl, {
      file: "src/foo.ts",
      symptom: "bug",
    });
    expect(result.errors).toHaveLength(0); // hint is optional, won't error
    expect(result.prompt).not.toContain("{file}");
    expect(result.prompt).not.toContain("{symptom}");
  });
});

describe("mergeTemplates", () => {
  it("returns builtin when no user templates", () => {
    const result = mergeTemplates(BUILTIN_TEMPLATES, []);
    expect(result).toHaveLength(BUILTIN_TEMPLATES.length);
  });

  it("user template overrides builtin with same ID", () => {
    const userTpl: TaskTemplate = {
      id: "fix-bug", // same as builtin
      label: "Custom Fix",
      description: "User override",
      task_type: "code_gen",
      mode: "execute",
      prompt_template: "Custom: fix {file}",
      required_fields: ["file"],
      optional_fields: [],
      acceptance_template: "Custom acceptance",
    };
    const result = mergeTemplates(BUILTIN_TEMPLATES, [userTpl]);
    const fixBug = result.find((t) => t.id === "fix-bug");
    expect(fixBug!.label).toBe("Custom Fix");
  });

  it("adds new user templates alongside builtins", () => {
    const userTpl: TaskTemplate = {
      id: "custom-task",
      label: "Custom Task",
      description: "A new custom template",
      task_type: "doc_gen",
      mode: "execute",
      prompt_template: "Do {thing}",
      required_fields: ["thing"],
      optional_fields: [],
      acceptance_template: "Done",
    };
    const result = mergeTemplates(BUILTIN_TEMPLATES, [userTpl]);
    expect(result).toHaveLength(BUILTIN_TEMPLATES.length + 1);
    expect(result.find((t) => t.id === "custom-task")).toBeDefined();
  });
});
