import type { Command } from "commander";
import { resolve } from "node:path";
import { AGENT_FARM_SKILL_MD } from "../../../infrastructure/templates/skill-md.js";
import { InitProjectUseCase } from "../../../application/use-cases/project/init-project.js";
import { createNodeProjectInitGateway } from "../../../infrastructure/project/node-project-init-gateway.js";
import { print } from "../print.js";
import type { DevEnvironment } from "../env-parse.js";
import { parseEnvironmentList, selectEnvironmentsInteractively } from "../env-parse.js";
import { detectExecutorPreset } from "../bins.js";
import { AGENTS_MD_TEMPLATE, CLAUDE_MD_TEMPLATE } from "../init-markdown.js";

export function registerProjectCommands(program: Command): void {
  const project = program.command("project");
  const initProject = new InitProjectUseCase(createNodeProjectInitGateway());

  project
    .command("init")
    .option("--target-dir <path>", "project root directory", process.cwd())
    .option("--skill-name <name>", "skill folder name", "agent-farm-dispatch")
    .option(
      "--environments <list>",
      "development environments (comma list): cursor,claude,codex"
    )
    .option("--no-interactive", "disable interactive environment selection")
    .option("--workers <n>", "default dispatch workers in script", "6")
    .option("--storage <name>", "storage backend: sqlite|jsonl", "sqlite")
    .option("--db-file <path>", "sqlite database file path")
    .option("--executor <name>", "executor preset: auto|opencode|codex|claude", "auto")
    .option("--executor-command <tpl>", "custom executor command template (overrides --executor)")
    .option("--force", "overwrite existing files", false)
    .action(async (opts) => {
      const storage = String(opts.storage ?? "sqlite").toLowerCase();
      if (!["sqlite", "jsonl"].includes(storage)) {
        throw new Error(`invalid storage: ${storage}. expected sqlite|jsonl`);
      }
      const selectedEnvironments: DevEnvironment[] = String(opts.environments ?? "").trim()
        ? parseEnvironmentList(String(opts.environments))
        : opts.interactive
        ? await selectEnvironmentsInteractively()
        : ["cursor"];

      const preset = String(opts.executor).toLowerCase();
      const detected = detectExecutorPreset();

      const result = await initProject.execute({
        projectRoot: resolve(String(opts.targetDir)),
        skillName: String(opts.skillName),
        environments: selectedEnvironments,
        force: Boolean(opts.force),
        workers: Number(opts.workers),
        storage: storage as "sqlite" | "jsonl",
        dbFile: opts.dbFile ? String(opts.dbFile) : undefined,
        executorPreset: preset,
        executorCommand: String(opts.executorCommand ?? ""),
        detectedExecutor: detected,
        templates: {
          skillMd: AGENT_FARM_SKILL_MD,
          claudeMd: CLAUDE_MD_TEMPLATE,
          codexMd: AGENTS_MD_TEMPLATE,
        },
      });
      print(result);
    });
}
