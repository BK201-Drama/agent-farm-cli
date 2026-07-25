import { QueueService } from "../application/facades/queue.js";
import { InsightsService } from "../application/facades/insights.js";
import { DoctorService } from "../application/facades/doctor.js";
import { StatusService } from "../application/facades/status.js";
import { DecisionService } from "../application/facades/decision-service.js";
import { DecisionEngine } from "../application/engines/decision-engine.js";
import { ShellLlmDecisionResolver } from "../application/engines/llm-decision-resolver.js";
import { SqliteDecisionRepository } from "../infrastructure/persistence/sqlite/decisions.js";
import { JsonlDecisionRepository } from "../infrastructure/persistence/jsonl/decisions.js";
import { systemIsoClock } from "../infrastructure/clock/iso-clock.js";
import { defaultShellRunner } from "../infrastructure/process/shell.js";
import { JsonlTaskRepository } from "../infrastructure/persistence/jsonl/tasks.js";
import { JsonlEventRepository } from "../infrastructure/persistence/jsonl/events.js";
import { JsonlQuarantineRepository } from "../infrastructure/persistence/jsonl/quarantine.js";
import { SqliteTaskRepository } from "../infrastructure/persistence/sqlite/tasks.js";
import { SqliteEventRepository } from "../infrastructure/persistence/sqlite/events.js";
import { SqliteQuarantineRepository } from "../infrastructure/persistence/sqlite/quarantine.js";
import { SqliteExecutionMemoryRepository } from "../infrastructure/persistence/sqlite/execution-memory.js";
import { defaultContainerPorts, type ContainerPorts } from "./container-ports.js";
import { warnJsonlStorageIfNeeded } from "../domain/task/storage-policy.js";
import { loadDecisionRules } from "../infrastructure/config/decision-rules-loader.js";

export type StoragePaths = {
  storage?: "jsonl" | "sqlite";
  dbFile?: string;
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
  /** JSONL storage 的决策文件路径。默认 `${runsDir}/decisions.jsonl` */
  decisionsFile?: string;
};

export function createContainer(paths: StoragePaths, portOverrides?: Partial<ContainerPorts>) {
  const storage = paths.storage ?? "sqlite";
  warnJsonlStorageIfNeeded(storage);
  const dbFile = paths.dbFile ?? `${process.cwd()}/.agent-farm/queue/agent_farm.db`;
  const ports = defaultContainerPorts(portOverrides);
  const taskRepo = storage === "sqlite" ? new SqliteTaskRepository(dbFile) : new JsonlTaskRepository(paths.taskFile);
  const eventRepo =
    storage === "sqlite" ? new SqliteEventRepository(dbFile) : new JsonlEventRepository(paths.eventFile);
  const quarantineRepo =
    storage === "sqlite" ? new SqliteQuarantineRepository(dbFile) : new JsonlQuarantineRepository(paths.quarantineFile);
  const executionMemoryRepo = new SqliteExecutionMemoryRepository(dbFile);

  // Decision arbitration
  const decisionConfig = ports.projectConfig.load(process.cwd())?.decision;
  const decisionRepo =
    storage === "sqlite"
      ? new SqliteDecisionRepository(dbFile)
      : new JsonlDecisionRepository(
          paths.decisionsFile ?? `${process.cwd()}/.agent-farm/runs/decisions.jsonl`,
        );
  const decisionRules = loadDecisionRules(decisionConfig);
  const autoThreshold = decisionConfig?.auto_threshold ?? 0.85;

  // LLM resolver (optional — only when llm_command_template is configured)
  const llmResolver = decisionConfig?.llm_command_template
    ? new ShellLlmDecisionResolver(decisionConfig.llm_command_template, defaultShellRunner)
    : undefined;

  const decisionEngine = new DecisionEngine(decisionRules, decisionRepo, autoThreshold, systemIsoClock, llmResolver);
  const decisionService = new DecisionService(decisionEngine, decisionRepo, taskRepo, eventRepo, systemIsoClock);

  return {
    taskRepo,
    eventRepo,
    quarantineRepo,
    executionMemoryRepo,
    decisionRepo,
    ports,
    queueService: new QueueService(taskRepo, quarantineRepo, systemIsoClock, executionMemoryRepo),
    insightsService: new InsightsService(taskRepo, eventRepo, ports.gitWorkspace, executionMemoryRepo),
    doctorService: new DoctorService(taskRepo, quarantineRepo, ports.gitWorkspace, eventRepo),
    statusService: new StatusService(taskRepo),
    decisionService,
    decisionEngine,
  };
}
