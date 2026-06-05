/**
 * `agent-farm template` — 任务模板管理
 */
import type { Command } from "commander";
import { BUILTIN_TEMPLATES } from "../../../application/template/builtin-templates.js";
import { loadUserTemplates } from "../../../application/template/template-store.js";
import { mergeTemplates, resolveTemplate } from "../../../application/template/template-resolver.js";
import type { TaskTemplate } from "../../../application/template/template-resolver.js";
import { spawnSync } from "node:child_process";

function getAllTemplates(cwd: string): TaskTemplate[] {
  return mergeTemplates(BUILTIN_TEMPLATES, loadUserTemplates(cwd));
}

function dispatchPrompt(prompt: string, acceptance: string, taskType: string): void {
  const taskJson = JSON.stringify({
    task_id: `tpl-${Date.now()}`,
    dedupe_key: `tpl-${Date.now()}`,
    prompt,
    acceptance_criteria: acceptance,
    task_type: taskType,
  });
  spawnSync(process.execPath, [process.argv[1] ?? "", "queue", "add", "--task-json", taskJson], {
    stdio: "inherit",
    encoding: "utf8",
  });
}

export function registerTemplateCommands(program: Command): void {
  const template = program.command("template").description("任务模板：快速生成标准化 prompt");

  template
    .command("list")
    .description("列出所有可用模板（内置 + 自定义）")
    .option("--cwd <path>", "工作目录", process.cwd())
    .action(async (opts) => {
      const all = getAllTemplates(opts.cwd);
      if (all.length === 0) {
        console.log("(无可用模板)");
        return;
      }
      const builtinIds = new Set(BUILTIN_TEMPLATES.map((t) => t.id));
      for (const t of all) {
        const tag = builtinIds.has(t.id) ? "[内置]" : "[自定义]";
        console.log(`${tag} ${t.id.padEnd(18)} ${t.label}`);
        if (t.description) console.log(`     ${t.description}`);
      }
    });

  template
    .command("show <id>")
    .description("查看模板详情")
    .option("--cwd <path>", "工作目录", process.cwd())
    .action(async (id: string, opts) => {
      const t = getAllTemplates(opts.cwd).find((t) => t.id === id);
      if (!t) {
        console.error(`✗ 模板不存在: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(`ID:          ${t.id}`);
      console.log(`名称:        ${t.label}`);
      console.log(`描述:        ${t.description}`);
      console.log(`任务类型:    ${t.task_type}`);
      console.log(`模式:        ${t.mode}`);
      console.log(`必需字段:    ${t.required_fields.join(", ") || "(无)"}`);
      console.log(`可选字段:    ${t.optional_fields.join(", ") || "(无)"}`);
      console.log(`---`);
      console.log(`模板内容:`);
      console.log(t.prompt_template);
      console.log(`---`);
      console.log(`验收标准:`);
      console.log(t.acceptance_template);
    });

  template
    .command("apply <id>")
    .description("应用模板：填入变量 → 生成 prompt → 入队")
    .option("--cwd <path>", "工作目录", process.cwd())
    .option("--var <key=value...>", "模板变量（可多次使用）", [])
    .option("--dry-run", "仅预览生成的 prompt，不入队")
    .action(async (id: string, opts) => {
      const t = getAllTemplates(opts.cwd).find((t) => t.id === id);
      if (!t) {
        console.error(`✗ 模板不存在: ${id}`);
        process.exitCode = 1;
        return;
      }

      const variables: Record<string, string> = {};
      for (const kv of opts.var as string[]) {
        const eq = kv.indexOf("=");
        if (eq < 0) continue;
        variables[kv.slice(0, eq)] = kv.slice(eq + 1);
      }

      const result = resolveTemplate(t, variables);
      if (result.errors.length > 0) {
        console.error("✗ 模板解析出错:");
        for (const e of result.errors) console.error(`  - ${e}`);
        process.exitCode = 1;
        return;
      }

      console.log("生成 prompt:");
      console.log(result.prompt.slice(0, 500));
      if (result.prompt.length > 500) console.log("...(truncated)");
      console.log();
      console.log("验收标准:");
      console.log(result.acceptance_criteria);
      console.log();

      if (opts.dryRun) {
        console.log("(--dry-run, 未入队)");
        return;
      }

      dispatchPrompt(result.prompt, result.acceptance_criteria, result.task_type);
    });
}
