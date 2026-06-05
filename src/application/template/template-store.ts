/**
 * 用户模板存储 — 读写 .agent-farm/templates/*.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskTemplate } from "./template-resolver.js";

function templatesDir(cwd: string): string {
  return join(cwd, ".agent-farm", "templates");
}

export function loadUserTemplates(cwd: string): TaskTemplate[] {
  const dir = templatesDir(cwd);
  if (!existsSync(dir)) return [];
  const templates: TaskTemplate[] = [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(dir, file), "utf8");
        const t = JSON.parse(raw) as TaskTemplate;
        if (t.id && t.prompt_template) {
          templates.push(t);
        }
      } catch {
        console.error(`[agent-farm] failed to parse template: ${file}`);
      }
    }
  } catch {
    return [];
  }
  return templates;
}

export function saveUserTemplate(cwd: string, template: TaskTemplate): void {
  const dir = templatesDir(cwd);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${template.id}.json`);
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`, "utf8");
}

export function deleteUserTemplate(cwd: string, id: string): boolean {
  const dir = templatesDir(cwd);
  const path = join(dir, `${id}.json`);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}
