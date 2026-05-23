import { resolve } from "node:path";
import type { DevEnvironment } from "./dev-environment.js";
import { EXECUTOR_PRESETS } from "./executor-presets.js";
import type { ProjectInitGateway } from "../../contracts/project-init-gateway.js";

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
  /** 非空时写入 `.agent-farm/waves/team-handoff-min.example.json`（可由 CLI 从包内 examples 读取） */
  exampleWaveUtf8?: string;
  /** 为 true 时不写入示例 wave */
  skipExampleWave?: boolean;
  /** 非空时写入 `.github/workflows/agent-farm-health.yml` */
  healthWorkflowUtf8?: string;
  /** 为 true 时不写入 health workflow */
  skipHealthWorkflow?: boolean;
};

export type InitProjectResult = Record<string, unknown>;

export class InitProjectUseCase {
  constructor(private readonly gateway: ProjectInitGateway) {}

  async execute(cmd: InitProjectCommand): Promise<InitProjectResult> {
    const projectRoot = resolve(cmd.projectRoot);
    const queueDir = resolve(projectRoot, ".agent-farm/queue");
    const configDir = resolve(projectRoot, ".agent-farm");
    const wavesDir = resolve(configDir, "waves");
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
    const gw = this.gateway;

    await gw.mkdirRecursive(queueDir);
    await gw.mkdirRecursive(configDir);
    await gw.mkdirRecursive(wavesDir);
    if (selectedEnvironments.includes("cursor")) {
      await gw.mkdirRecursive(skillDir);
    }
    await gw.mkdirRecursive(scriptDir);

    const ensureWritable = async (path: string): Promise<void> => {
      if (force) return;
      if (await gw.fileExists(path)) {
        throw new Error(`file already exists: ${path} (use --force to overwrite)`);
      }
    };

    if (selectedEnvironments.includes("cursor")) await ensureWritable(skillPath);
    if (selectedEnvironments.includes("claude")) await ensureWritable(claudePath);
    if (selectedEnvironments.includes("codex")) await ensureWritable(codexPath);
    await ensureWritable(dispatchPath);
    await ensureWritable(configFile);
    if (storage === "sqlite") await ensureWritable(dbFile);

    if (storage === "jsonl") {
      await gw.writeUtf8File(taskFile, "");
      await gw.writeUtf8File(eventFile, "");
      await gw.writeUtf8File(quarantineFile, "");
    } else {
      await gw.warmSqliteSchema(dbFile);
    }
    const workers = cmd.workers;
    const preset = cmd.executorPreset.toLowerCase();
    const customCommand = cmd.executorCommand.trim();
    const detected = cmd.detectedExecutor;
    const selectedPreset = preset === "auto" ? "auto" : preset;
    const isCursorSdk = selectedPreset === "cursor-sdk" || selectedPreset === "cursor_sdk";
    await gw.writeUtf8File(
      configFile,
      `${JSON.stringify(
        {
          storage,
          db_file: dbFile,
          task_file: taskFile,
          event_file: eventFile,
          quarantine_file: quarantineFile,
          ...(isCursorSdk ? { executor: "cursor-sdk" } : {}),
        },
        null,
        2,
      )}\n`,
    );
    if (selectedEnvironments.includes("cursor")) {
      await gw.writeUtf8File(skillPath, cmd.templates.skillMd);
    }
    if (selectedEnvironments.includes("claude")) {
      await gw.writeUtf8File(claudePath, cmd.templates.claudeMd);
    }
    if (selectedEnvironments.includes("codex")) {
      await gw.writeUtf8File(codexPath, cmd.templates.codexMd);
    }
    const commandTemplate =
      customCommand || (isCursorSdk ? "" : selectedPreset === "auto" ? "" : EXECUTOR_PRESETS[selectedPreset]) || "";
    const scriptText = gw.buildDispatchScript({
      commandTemplate,
      workers: Number.isFinite(workers) ? workers : 6,
    });
    await gw.writeUtf8File(dispatchPath, scriptText);
    await gw.trySetExecutable(dispatchPath, 0o755);

    let exampleWaveFile: string | undefined;
    if (!cmd.skipExampleWave && cmd.exampleWaveUtf8?.trim()) {
      exampleWaveFile = resolve(wavesDir, "team-handoff-min.example.json");
      if (force || !(await gw.fileExists(exampleWaveFile))) {
        await gw.writeUtf8File(exampleWaveFile, cmd.exampleWaveUtf8);
      }
    }

    let healthWorkflowFile: string | undefined;
    if (!cmd.skipHealthWorkflow && cmd.healthWorkflowUtf8?.trim()) {
      const workflowDir = resolve(projectRoot, ".github", "workflows");
      await gw.mkdirRecursive(workflowDir);
      healthWorkflowFile = resolve(workflowDir, "agent-farm-health.yml");
      if (force || !(await gw.fileExists(healthWorkflowFile))) {
        await gw.writeUtf8File(healthWorkflowFile, cmd.healthWorkflowUtf8);
      }
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
        waves_dir: wavesDir,
        ...(exampleWaveFile ? { example_wave_file: exampleWaveFile } : {}),
        ...(healthWorkflowFile ? { health_workflow_file: healthWorkflowFile } : {}),
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
