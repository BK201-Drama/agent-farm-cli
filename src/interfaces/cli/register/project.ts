import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { createContainer } from "../../../bootstrap/container.js";
import { openDb } from "../../../infrastructure/persistence/sqlite/sqlite-db.js";
import { AGENT_FARM_SKILL_MD } from "../../../infrastructure/templates/skill-template.js";
import { generateDispatchScript } from "../../../infrastructure/templates/dispatch-script-template.js";
import { print } from "../cli-print.js";
import { EXECUTOR_PRESETS } from "../defaults.js";
import type { DevEnvironment } from "../env-parse.js";
import { parseEnvironmentList, selectEnvironmentsInteractively } from "../env-parse.js";
import { detectExecutorPreset } from "../os-binary.js";
import { AGENTS_MD_TEMPLATE, CLAUDE_MD_TEMPLATE } from "../project-md-templates.js";

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
    .action(async (opts) => {
      const projectRoot = resolve(String(opts.targetDir));
      const queueDir = resolve(projectRoot, ".agent-farm/queue");
      const configDir = resolve(projectRoot, ".agent-farm");
      const configFile = resolve(configDir, "config.json");
      const taskFile = resolve(queueDir, "tasks.jsonl");
      const eventFile = resolve(queueDir, "events.jsonl");
      const quarantineFile = resolve(queueDir, "quarantine_tasks.jsonl");
      const storage = String(opts.storage ?? "sqlite").toLowerCase();
      if (!["sqlite", "jsonl"].includes(storage)) {
        throw new Error(`invalid storage: ${storage}. expected sqlite|jsonl`);
      }
      const dbFile = opts.dbFile ? resolve(projectRoot, String(opts.dbFile)) : resolve(queueDir, "agent_farm.db");
      const selectedEnvironments: DevEnvironment[] = String(opts.environments ?? "").trim()
        ? parseEnvironmentList(String(opts.environments))
        : opts.interactive
        ? await selectEnvironmentsInteractively()
        : ["cursor"];
      const skillDir = resolve(projectRoot, ".cursor/skills", String(opts.skillName));
      const skillPath = resolve(skillDir, "SKILL.md");
      const claudePath = resolve(projectRoot, "CLAUDE.md");
      const codexPath = resolve(projectRoot, "AGENTS.md");
      const scriptDir = resolve(projectRoot, "scripts");
      const dispatchPath = resolve(scriptDir, "agent-farm-dispatch.sh");
      const force = Boolean(opts.force);

      await mkdir(queueDir, { recursive: true });
      await mkdir(configDir, { recursive: true });
      if (selectedEnvironments.includes("cursor")) {
        await mkdir(skillDir, { recursive: true });
      }
      await mkdir(scriptDir, { recursive: true });

      const ensureWritable = async (path: string): Promise<void> => {
        if (force) return;
        try {
          await access(path, constants.F_OK);
          throw new Error(`file already exists: ${path} (use --force to overwrite)`);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("file already exists:")) throw err;
        }
      };

      if (selectedEnvironments.includes("cursor")) await ensureWritable(skillPath);
      if (selectedEnvironments.includes("claude")) await ensureWritable(claudePath);
      if (selectedEnvironments.includes("codex")) await ensureWritable(codexPath);
      await ensureWritable(dispatchPath);
      await ensureWritable(configFile);
      if (storage === "sqlite") await ensureWritable(dbFile);

      if (storage === "jsonl") {
        await writeFile(taskFile, "", "utf8");
        await writeFile(eventFile, "", "utf8");
        await writeFile(quarantineFile, "", "utf8");
      } else {
        createContainer({
          storage: "sqlite",
          dbFile,
          taskFile,
          eventFile,
          quarantineFile,
        });
        openDb(dbFile);
      }
      await writeFile(
        configFile,
        `${JSON.stringify(
          {
            storage,
            db_file: dbFile,
            task_file: taskFile,
            event_file: eventFile,
            quarantine_file: quarantineFile,
          },
          null,
          2
        )}\n`,
        "utf8"
      );
      if (selectedEnvironments.includes("cursor")) {
        await writeFile(skillPath, AGENT_FARM_SKILL_MD, "utf8");
      }
      if (selectedEnvironments.includes("claude")) {
        await writeFile(claudePath, CLAUDE_MD_TEMPLATE, "utf8");
      }
      if (selectedEnvironments.includes("codex")) {
        await writeFile(codexPath, AGENTS_MD_TEMPLATE, "utf8");
      }
      const workers = Number(opts.workers);
      const preset = String(opts.executor).toLowerCase();
      const customCommand = String(opts.executorCommand ?? "").trim();
      const detected = detectExecutorPreset();
      const selectedPreset = preset === "auto" ? "auto" : preset;
      const commandTemplate =
        customCommand || (selectedPreset === "auto" ? "" : EXECUTOR_PRESETS[selectedPreset]) || "";
      const scriptText = generateDispatchScript({
        commandTemplate,
        workers: Number.isFinite(workers) ? workers : 6,
      });
      await writeFile(dispatchPath, scriptText, "utf8");
      await chmod(dispatchPath, 0o755);

      print({
        ok: true,
        project_root: projectRoot,
        files: {
          config_file: configFile,
          task_file: taskFile,
          event_file: eventFile,
          quarantine_file: quarantineFile,
          ...(storage === "sqlite" ? { db_file: dbFile } : {}),
          dispatch_script: dispatchPath,
          ...(selectedEnvironments.includes("cursor") ? { skill_file: skillPath } : {}),
          ...(selectedEnvironments.includes("claude") ? { claude_file: claudePath } : {}),
          ...(selectedEnvironments.includes("codex") ? { codex_file: codexPath } : {}),
        },
        environments: selectedEnvironments,
        storage: {
          selected: storage,
          db_file: storage === "sqlite" ? dbFile : null,
        },
        executor: {
          requested: preset,
          selected: customCommand ? "custom" : selectedPreset,
          detected,
          command_template: commandTemplate || "(auto runtime detection in dispatch script)",
        },
      });
    });
}
