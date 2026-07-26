import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Command } from "commander";
import { print } from "../print.js";
import type { JsonMap } from "../../../domain/task.js";
import {
  decomposeRequirement,
  buildDecomposePrompt,
} from "../../../application/wave/decompose-service.js";
import {
  defaultWaveOutputPath,
  sanitizeWaveSlug,
} from "../../../application/wave/build-plan-execute-wave.js";
import { validateWaveArray } from "../../../application/wave/wave-validate.js";

// ── Preview formatting ──

const MODE_ICONS: Record<string, string> = {
  plan: "📋",
  execute: "🔧",
  verify: "✅",
};

function formatDependsOn(deps: unknown): string {
  if (!Array.isArray(deps) || deps.length === 0) return "（无依赖）";
  return deps.join(", ");
}

function formatParallelGroup(group: unknown): string {
  if (typeof group !== "string" || !group.trim()) return "—";
  return group;
}

function printPlanPreview(items: JsonMap[]): void {
  const lines: string[] = [];
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("  📊 任务拆解预览");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  // Group by parallel_group for display
  const groups = new Map<string, JsonMap[]>();
  const noGroup: JsonMap[] = [];

  for (const item of items) {
    const pg = item.parallel_group;
    if (typeof pg === "string" && pg.trim()) {
      const existing = groups.get(pg) ?? [];
      existing.push(item);
      groups.set(pg, existing);
    } else {
      noGroup.push(item);
    }
  }

  // Display groups
  let index = 1;
  for (const [groupName, groupItems] of groups) {
    const isSerial = groupItems.length === 1;
    const badge = isSerial ? "🔹 串行" : `⚡ 并行 ×${groupItems.length}`;
    lines.push(`  ${badge}  阶段: ${groupName}`);
    lines.push(`  ${"─".repeat(40)}`);

    for (const item of groupItems) {
      const mode = String(item.mode ?? "execute");
      const icon = MODE_ICONS[mode] ?? "❓";
      const taskId = String(item.task_id ?? "?");
      const priority = item.priority != null ? ` P${item.priority}` : "";
      const taskType = item.task_type ? ` [${item.task_type}]` : "";
      const deps = formatDependsOn(item.depends_on);

      lines.push(`  ${index}. ${icon}${priority} **${taskId}**${taskType}`);
      lines.push(`     依赖: ${deps}`);

      const prompt = String(item.prompt ?? "");
      const brief = prompt.length > 100 ? prompt.slice(0, 97) + "..." : prompt;
      lines.push(`     描述: ${brief}`);

      const ac = String(item.acceptance_criteria ?? "");
      if (ac) {
        lines.push(`     验收: ${ac}`);
      }
      lines.push("");
      index++;
    }
  }

  // Display items without parallel_group
  if (noGroup.length > 0) {
    lines.push(`  ⚡ 并行 ×${noGroup.length}  阶段: (未分组)`);
    lines.push(`  ${"─".repeat(40)}`);
    for (const item of noGroup) {
      const mode = String(item.mode ?? "execute");
      const icon = MODE_ICONS[mode] ?? "❓";
      const taskId = String(item.task_id ?? "?");
      const priority = item.priority != null ? ` P${item.priority}` : "";
      const deps = formatDependsOn(item.depends_on);

      lines.push(`  ${index}. ${icon}${priority} **${taskId}**`);
      lines.push(`     依赖: ${deps}`);

      const prompt = String(item.prompt ?? "");
      const brief = prompt.length > 100 ? prompt.slice(0, 97) + "..." : prompt;
      lines.push(`     描述: ${brief}`);
      lines.push("");
      index++;
    }
  }

  // Summary
  const planCount = items.filter((i) => i.mode === "plan").length;
  const execCount = items.filter((i) => i.mode === "execute").length;
  const verifyCount = items.filter((i) => i.mode === "verify").length;

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(
    `  📋 plan ×${planCount}  🔧 execute ×${execCount}  ✅ verify ×${verifyCount}  |  共 ${items.length} 个任务`,
  );
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  process.stdout.write(lines.join("\n"));
}

async function confirmYesNo(question: string, defaultYes = true): Promise<boolean> {
  const rl = createInterface({ input, output });
  const suffix = defaultYes ? " [Y/n]" : " [y/N]";
  const answer = (await rl.question(`${question}${suffix}: `)).trim().toLowerCase();
  rl.close();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

// ── CLI registration ──

export function registerPlanCommand(program: Command): void {
  program
    .command("plan")
    .description(
      "自然语言需求 → 自动拆解为 wave，预览确认后入队。" +
        "一键替代手写 wave JSON：你只需描述要做什么。",
    )
    .argument("[requirement]", "自然语言需求描述；省略时从 --requirement 或 stdin 读取")
    .option("--requirement <text>", "需求文本（与位置参数二选一）")
    .option("--output <path>", "输出 JSON 文件路径（默认自动写入 .agent-farm/waves/）")
    .option("--model <model>", "LLM 模型（默认 claude-sonnet-5）")
    .option("--executor <template>", "自定义 executor 命令模板，占位符 {prompt} {model}")
    .option("--slug <slug>", "波次标识，用于 task_id 前缀和输出文件名")
    .option("--timeout <ms>", "LLM 调用超时毫秒", "180000")
    .option("--yes", "跳过确认，直接入队", false)
    .option("--dry-run", "仅打印将发送给 LLM 的 prompt，不实际调用", false)
    .option("--no-enqueue", "拆解后不入队，仅输出 wave JSON", false)
    .action(async (requirementArg: string | undefined, opts: Record<string, unknown>) => {
      // Resolve requirement: positional arg > --requirement > stdin
      let requirement = String(requirementArg ?? "").trim();
      const optReq = String(opts.requirement ?? "").trim();
      if (!requirement && optReq) requirement = optReq;

      if (!requirement) {
        if (!process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
          }
          requirement = Buffer.concat(chunks).toString("utf8").trim();
        }
        if (!requirement) {
          throw new Error(
            "plan 需要需求文本。用法: agent-farm plan \"实现用户登录 + 注册模块\"",
          );
        }
      }

      // Dry-run: just print the prompt
      if (opts.dryRun) {
        process.stdout.write(`${buildDecomposePrompt(requirement)}\n`);
        return;
      }

      const timeoutMs = Number(opts.timeout) || 180_000;

      print({
        ok: true,
        message: "正在分析需求并拆解任务...",
        requirement: requirement.length > 80 ? requirement.slice(0, 77) + "..." : requirement,
      });

      const decomposed = await decomposeRequirement(requirement, {
        model: opts.model ? String(opts.model) : undefined,
        executorTemplate: opts.executor ? String(opts.executor) : undefined,
        timeoutMs,
      });

      // Validate
      const label = "plan-output";
      validateWaveArray(decomposed, label);

      // Print preview
      printPlanPreview(decomposed);

      // Determine output path
      const slug =
        opts.slug ?
          sanitizeWaveSlug(String(opts.slug))
        : sanitizeWaveSlug(requirement.slice(0, 48));
      const outPath =
        opts.output ?
          resolve(String(opts.output))
        : defaultWaveOutputPath(process.cwd(), slug);

      // Check for confirmation
      const shouldEnqueue = opts.noEnqueue ? false : true;
      if (shouldEnqueue && !opts.yes) {
        const confirmed = await confirmYesNo("确认入队执行？");
        if (!confirmed) {
          // Write the wave file anyway so user can edit and enqueue later
          const json = `${JSON.stringify(decomposed, null, 2)}\n`;
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, json, "utf8");

          print({
            ok: true,
            message: "已取消入队。wave JSON 已保存，可手动编辑后入队",
            path: outPath,
            tasks: decomposed.length,
            hint: `编辑后运行: agent-farm wave enqueue-wave ${outPath}`,
          });
          return;
        }
      }

      // Write wave file
      const json = `${JSON.stringify(decomposed, null, 2)}\n`;
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, json, "utf8");

      if (shouldEnqueue) {
        // Enqueue
        const { spawnSync } = await import("node:child_process");
        const { existsSync } = await import("node:fs");
        const { join, dirname: dn } = await import("node:path");
        const { fileURLToPath } = await import("node:url");

        const root = join(dn(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
        const script = join(root, "scripts", "enqueue-task-wave.mjs");
        if (!existsSync(script)) {
          throw new Error(`enqueue 脚本未找到: ${script}`);
        }

        print({
          ok: true,
          message: "正在入队...",
          wave: outPath,
          tasks: decomposed.length,
        });

        const r = spawnSync(process.execPath, [script, outPath], {
          cwd: process.cwd(),
          stdio: "inherit",
          env: { ...process.env, AGENT_FARM_STORAGE: process.env.AGENT_FARM_STORAGE ?? "sqlite" },
        });
        if (r.status !== 0) {
          process.exit(r.status ?? 1);
        }
      } else {
        print({
          ok: true,
          message: "拆解完成；wave JSON 已写入（未入队）",
          path: outPath,
          tasks: decomposed.length,
          hint: `入队: agent-farm wave enqueue-wave ${outPath}`,
        });
      }
    });
}
