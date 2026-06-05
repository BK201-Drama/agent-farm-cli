/**
 * 模板解析器 — 合并内置 + 用户模板，变量替换
 */

export type TaskTemplate = {
  id: string;
  label: string;
  description: string;
  task_type: string;
  mode: "plan" | "execute" | "verify";
  prompt_template: string;
  required_fields: string[];
  optional_fields: string[];
  acceptance_template: string;
};

export type TemplateResolveResult = {
  prompt: string;
  acceptance_criteria: string;
  task_type: string;
  mode: string;
  errors: string[];
};

/**
 * 用提供的变量值替换模板中的 {placeholder} 占位符。
 * 缺失必需字段时返回 errors。
 */
export function resolveTemplate(
  template: TaskTemplate,
  variables: Record<string, string>,
): TemplateResolveResult {
  const errors: string[] = [];

  for (const field of template.required_fields) {
    if (!variables[field] || variables[field].trim().length === 0) {
      errors.push(`缺少必需字段: ${field}`);
    }
  }

  let prompt = template.prompt_template;
  const allFields = [...template.required_fields, ...template.optional_fields];
  for (const field of allFields) {
    const val = variables[field] ?? "";
    prompt = prompt.replaceAll(`{${field}}`, val);
  }

  // Warn about unreplaced placeholders
  const remaining = prompt.match(/\{(\w+)\}/g);
  if (remaining) {
    for (const m of remaining) {
      errors.push(`未替换的占位符: ${m}`);
    }
  }

  let acceptance = template.acceptance_template;
  for (const field of allFields) {
    const val = variables[field] ?? "";
    acceptance = acceptance.replaceAll(`{${field}}`, val);
  }

  return {
    prompt,
    acceptance_criteria: acceptance,
    task_type: template.task_type,
    mode: template.mode,
    errors,
  };
}

/** 合并内置模板和用户自定义模板（用户模板覆盖同 ID 内置模板） */
export function mergeTemplates(
  builtin: TaskTemplate[],
  user: TaskTemplate[],
): TaskTemplate[] {
  const map = new Map<string, TaskTemplate>();
  for (const t of builtin) map.set(t.id, t);
  for (const t of user) map.set(t.id, t);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
