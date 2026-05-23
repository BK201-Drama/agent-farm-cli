import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { print } from "../print.js";
import {
  buildPlanExecuteWave,
  defaultWaveOutputPath,
  sanitizeWaveSlug,
} from "../../../application/wave/build-plan-execute-wave.js";
import { validateWaveArray } from "../../../application/wave/wave-validate.js";

function parseReadPaths(raw: string | undefined, fallback: string[]): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  return text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

async function promptLine(question: string, defaultValue = ""): Promise<string> {
  const rl = createInterface({ input, output });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  rl.close();
  return answer || defaultValue;
}

export function registerWaveCommands(program: Command): void {
  const wave = program.command("wave").description("Wave 辅助：从目标生成 plan+execute 最小波次 JSON");

  wave
    .command("new")
    .description("生成 plan+execute 两条任务的 wave 文件（默认写入 .agent-farm/waves/）")
    .option("--slug <id>", "波次标识（英文/数字，用于 task_id）")
    .option("--goal <text>", "本波要实现的目标描述")
    .option("--repo <label>", "仓库描述写入 prompt", "本仓库")
    .option("--read-path <paths>", "plan 阶段 Read 路径，逗号分隔")
    .option("--read-path-execute <paths>", "execute 阶段 Read 路径，逗号分隔")
    .option("--acceptance-plan <text>", "plan 验收说明")
    .option("--acceptance-execute <text>", "execute acceptance_criteria", "npm run check && npm test")
    .option("--output <path>", "输出 JSON 路径（默认 .agent-farm/waves/<slug>-<date>.json）")
    .option("--print", "仅打印 JSON 到 stdout，不写文件", false)
    .option("--no-interactive", "禁用交互补全 slug/goal", false)
    .action(async (opts) => {
      let slug = String(opts.slug ?? "").trim();
      let goal = String(opts.goal ?? "").trim();
      const interactive = !opts.noInteractive;

      if (interactive) {
        if (!slug) {
          slug = await promptLine("波次 slug（英文，如 auth-login）");
        }
        if (!goal) {
          goal = await promptLine("本波目标（一句话）");
        }
      }

      if (!slug || !goal) {
        throw new Error("wave new 需要 --slug 与 --goal；或在 TTY 下去掉 --no-interactive 以交互输入");
      }

      slug = sanitizeWaveSlug(slug);
      const planRead = parseReadPaths(opts.readPath, ["docs/agents/wave-prompt-playbook.md", "src/"]);
      const executeRead = parseReadPaths(opts.readPathExecute, ["docs/agents/wave-prompt-playbook.md"]);

      const items = buildPlanExecuteWave({
        slug,
        goal,
        repoLabel: String(opts.repo ?? "本仓库"),
        planReadPaths: planRead,
        executeReadPaths: executeRead,
        acceptancePlan: opts.acceptancePlan ? String(opts.acceptancePlan) : undefined,
        acceptanceExecute: opts.acceptanceExecute ? String(opts.acceptanceExecute) : undefined,
      });

      const outRel = opts.output ? String(opts.output) : defaultWaveOutputPath(process.cwd(), slug);
      const outPath = resolve(outRel);
      const label = outPath.replace(/\\/g, "/").split("/").slice(-2).join("/");
      validateWaveArray(items, label);

      const json = `${JSON.stringify(items, null, 2)}\n`;

      if (opts.print) {
        process.stdout.write(json);
        return;
      }

      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, json, "utf8");

      print({
        ok: true,
        message: "已生成 plan+execute wave；校验通过",
        path: outPath,
        tasks: items.length,
        next_steps: [
          `agent-farm queue enqueue-wave ${outPath}`,
          `或: npm run farm:wave -- ${outPath}`,
          `校验: npm run validate:waves`,
        ],
      });
    });

  wave
    .command("enqueue-wave")
    .description("从 wave JSON 批量入队（封装 enqueue-task-wave）")
    .argument("<wave.json>", "wave 文件路径")
    .action(async (waveFile: string) => {
      const { spawnSync } = await import("node:child_process");
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const { dirname } = await import("node:path");

      const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
      const script = join(root, "scripts", "enqueue-task-wave.mjs");
      if (!existsSync(script)) {
        throw new Error(`enqueue 脚本未找到: ${script}`);
      }
      const target = resolve(waveFile);
      const r = spawnSync(process.execPath, [script, target], {
        cwd: process.cwd(),
        stdio: "inherit",
        env: { ...process.env, AGENT_FARM_STORAGE: process.env.AGENT_FARM_STORAGE ?? "sqlite" },
      });
      if (r.status !== 0) {
        process.exit(r.status ?? 1);
      }
    });
}
