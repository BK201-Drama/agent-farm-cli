import { QueueService } from "../application/services/queue-service.js";
import { InsightsService } from "../application/services/insights-service.js";
import { DoctorService } from "../application/services/doctor-service.js";
import { JsonlTaskRepository } from "../infrastructure/persistence/jsonl/task-repository.js";
import { JsonlEventRepository } from "../infrastructure/persistence/jsonl/event-repository.js";
import { JsonlQuarantineRepository } from "../infrastructure/persistence/jsonl/quarantine-repository.js";
import { SqliteTaskRepository } from "../infrastructure/persistence/sqlite/task-repository.js";
import { SqliteEventRepository } from "../infrastructure/persistence/sqlite/event-repository.js";
import { SqliteQuarantineRepository } from "../infrastructure/persistence/sqlite/quarantine-repository.js";

export type StoragePaths = {
  storage?: "jsonl" | "sqlite";
  dbFile?: string;
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
};

export function createContainer(paths: StoragePaths) {
  const storage = paths.storage ?? "sqlite";
  const dbFile = paths.dbFile ?? `${process.cwd()}/.agent-farm/queue/agent_farm.db`;
  const taskRepo = storage === "sqlite" ? new SqliteTaskRepository(dbFile) : new JsonlTaskRepository(paths.taskFile);
  const eventRepo = storage === "sqlite" ? new SqliteEventRepository(dbFile) : new JsonlEventRepository(paths.eventFile);
  const quarantineRepo =
    storage === "sqlite" ? new SqliteQuarantineRepository(dbFile) : new JsonlQuarantineRepository(paths.quarantineFile);
  return {
    taskRepo,
    eventRepo,
    quarantineRepo,
    queueService: new QueueService(taskRepo, quarantineRepo),
    insightsService: new InsightsService(taskRepo, eventRepo),
    doctorService: new DoctorService(taskRepo, quarantineRepo),
  };
}

export const createJsonlContainer = createContainer;
