import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "../../../infrastructure/persistence/sqlite/db.js";
import { generateDispatchScript } from "../../../infrastructure/templates/dispatch.js";
import type { DevEnvironment } from "../../project/dev-environment.js";
import { EXECUTOR_PRESETS } from "../../project/executor-presets.js";

export type InitProjectCommand = {
  projectRoot: string;
  skillName: string;
  environments: DevEnvironment[];
  force: boolean;
  workers: number;
  storage: "sqlite" | "jsonl";
  dbFile?: string;
  executorPreset: string;
  executorCommand: string;
  detectedExecutor: "opencode" | "codex" | "claude" | "none";
  /** 由适配层注入的文档模板（避免应用层依赖 interfaces） */
  templates: {
    skillMd: string;
    claudeMd: string;
    codexMd: string;
  };
};

export type InitProjectResult = Record<string, unknown>;

export class InitProjectUseCase {
  async execute(cmd: InitProjectCommand): Promise<InitProjectResult> {
    const projectRoot = resolve(cmd.projectRoot);
    const queueDir = resolve(projectRoot, ".agent-farm/queue");
    const configDir = resolve(projectRoot, ".agent-farm");
    const configFile = resolve(configDir, "config.json");
    const taskFile = resolve(queueDir, "tasks.jsonl");
    const eventFile = resolve(queueDir, "events.jsonl");
    const quarantineFile = resolve(queueDir, "quarantine_tasks.jsonl");
    const storage = cmd.storage;
    const dbFile = cmd.dbFile ? resolve(projectRoot, cmd.dbFile) : resolve(queueDir, "agent_farm.db");
    const selectedEnvironments = cmd.environments;
    const skillDir = resolve(projectRoot, ".cursor/skills", cmd.skillName);
    const skillPath = resolve(skillDir, "SKILL.md");
    const claudePath = resolve(projectRoot, "CLAUDE.md");
    const codexPath = resolve(projectRoot, "AGENTS.md");
    const scriptDir = resolve(projectRoot, "scripts");
    const dispatchPath = resolve(scriptDir, "agent-farm-dispatch.sh");
    const force = cmd.force;

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
      await writeFile(skillPath, cmd.templates.skillMd, "utf8");
    }
    if (selectedEnvironments.includes("claude")) {
      await writeFile(claudePath, cmd.templates.claudeMd, "utf8");
    }
    if (selectedEnvironments.includes("codex")) {
      await writeFile(codexPath, cmd.templates.codexMd, "utf8");
    }
    const workers = cmd.workers;
    const preset = cmd.executorPreset.toLowerCase();
    const customCommand = cmd.executorCommand.trim();
    const detected = cmd.detectedExecutor;
    const selectedPreset = preset === "auto" ? "auto" : preset;
    const commandTemplate =
      customCommand || (selectedPreset === "auto" ? "" : EXECUTOR_PRESETS[selectedPreset]) || "";
    const scriptText = generateDispatchScript({
      commandTemplate,
      workers: Number.isFinite(workers) ? workers : 6,
    });
    await writeFile(dispatchPath, scriptText, "utf8");
    try {
      await chmod(dispatchPath, 0o755);
    } catch {
      /* Windows 等环境可能忽略可执行位 */
    }

    return {
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
    };
  }
}
