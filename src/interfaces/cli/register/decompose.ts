import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { print } from "../print.js";
import type { JsonMap } from "../../../domain/task.js";
import { decomposeRequirement, buildDecomposePrompt } from "../../../application/wave/decompose-service.js";
import { validateWaveArray } from "../../../application/wave/wave-validate.js";
import { defaultWaveOutputPath, sanitizeWaveSlug } from "../../../application/wave/build-plan-execute-wave.js";

export function registerDecomposeCommand(program: Command): void {
  program
    .command("decompose")
    .description(
      "自然语言需求 → 自动拆解为 wave JSON（1 plan + N execute）。" +
        "输出到 stdout；--output 写文件；--enqueue 直接入队。",
    )
    .argument("[requirement]", "自然语言需求描述；省略时从 --requirement 或 stdin 读取")
    .option("--requirement <text>", "需求文本（与位置参数二选一）")
    .option("--output <path>", "输出 JSON 文件路径（默认仅打印到 stdout）")
    .option("--enqueue", "拆解后自动入队（等同 agent-farm wave enqueue-wave）", false)
    .option("--model <model>", "LLM 模型（默认 claude-sonnet-5，可通过 AGENT_FARM_DECOMPOSE_MODEL 覆盖）")
    .option("--executor <template>", "自定义 executor 命令模板，占位符 {prompt} {model}")
    .option("--slug <slug>", "波次标识，用于 task_id 前缀和输出文件名（默认从需求自动提取）")
    .option("--timeout <ms>", "LLM 调用超时毫秒", "180000")
    .option("--dry-run", "仅打印将发送给 LLM 的 prompt，不实际调用", false)
    .action(async (requirementArg: string | undefined, opts: Record<string, unknown>) => {
      // Resolve requirement: positional arg > --requirement > stdin
      let requirement = String(requirementArg ?? "").trim();
      const optReq = String(opts.requirement ?? "").trim();
      if (!requirement && optReq) requirement = optReq;

      if (!requirement) {
        // Try reading from stdin (non-TTY)
        if (!process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
          }
          requirement = Buffer.concat(chunks).toString("utf8").trim();
        }
        if (!requirement) {
          throw new Error(
            "decompose 需要需求文本。用法: agent-farm decompose \"实现用户登录\" 或通过 stdin 传入",
          );
        }
      }

      // Dry-run: just print the prompt
      if (opts.dryRun) {
        process.stdout.write(`${buildDecomposePrompt(requirement)}\n`);
        return;
      }

      const timeoutMs = Number(opts.timeout) || 180_000;

      const decomposed = await decomposeRequirement(requirement, {
        model: opts.model ? String(opts.model) : undefined,
        executorTemplate: opts.executor ? String(opts.executor) : undefined,
        timeoutMs,
      });

      // Validate
      const label = "decompose-output";
      validateWaveArray(decomposed, label);

      const json = `${JSON.stringify(decomposed, null, 2)}\n`;

      // Output: write to file or stdout
      if (opts.output) {
        const outPath = resolve(String(opts.output));
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, json, "utf8");
        print({
          ok: true,
          message: "拆解完成；wave JSON 已写入",
          path: outPath,
          tasks: decomposed.length,
        });
      } else {
        process.stdout.write(json);
      }

      // Enqueue if requested
      if (opts.enqueue) {
        const wavePath =
          opts.output ?
            resolve(String(opts.output))
          : defaultWaveOutputPath(
              process.cwd(),
              sanitizeWaveSlug(opts.slug ? String(opts.slug) : requirement.slice(0, 48)),
            );

        // If not already written, write it now
        if (!opts.output) {
          mkdirSync(dirname(wavePath), { recursive: true });
          writeFileSync(wavePath, json, "utf8");
        }

        const { spawnSync } = await import("node:child_process");
        const { existsSync } = await import("node:fs");
        const { join, dirname: dn } = await import("node:path");
        const { fileURLToPath } = await import("node:url");

        const root = join(dn(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
        const script = join(root, "scripts", "enqueue-task-wave.mjs");
        if (!existsSync(script)) {
          throw new Error(`enqueue 脚本未找到: ${script}`);
        }

        print({ ok: true, message: "正在入队...", wave: wavePath, tasks: decomposed.length });

        const r = spawnSync(process.execPath, [script, wavePath], {
          cwd: process.cwd(),
          stdio: "inherit",
          env: { ...process.env, AGENT_FARM_STORAGE: process.env.AGENT_FARM_STORAGE ?? "sqlite" },
        });
        if (r.status !== 0) {
          process.exit(r.status ?? 1);
        }
      }
    });
}
