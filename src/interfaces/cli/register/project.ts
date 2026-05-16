import type { Command } from "commander";
import { resolve } from "node:path";
import { print } from "../print.js";
import type { DevEnvironment } from "../env-parse.js";
import { parseEnvironmentList, selectEnvironmentsInteractively } from "../env-parse.js";
import { detectExecutorPreset } from "../bins.js";

export function registerProjectCommands(program: Command): void {
  const project = program.command("project");

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
    .option("--skip-example-wave", "do not write .agent-farm/waves/team-handoff-min.example.json", false)
    .option("--skip-health-workflow", "do not write .github/workflows/agent-farm-health.yml", false)
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

      const { runProjectInitAction } = await import("./project-init-action.js");
      const result = await runProjectInitAction({
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
        skipExampleWave: Boolean(opts.skipExampleWave),
        skipHealthWorkflow: Boolean(opts.skipHealthWorkflow),
      });
      print(result);
    });
}
