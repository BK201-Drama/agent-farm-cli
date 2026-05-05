import { QueueService } from "../application/services/queue-service.js";
import { InsightsService } from "../application/services/insights-service.js";
import { DoctorService } from "../application/services/doctor-service.js";
import { systemIsoClock } from "../infrastructure/clock/iso-clock.js";
import { JsonlTaskRepository } from "../infrastructure/persistence/jsonl/tasks.js";
import { JsonlEventRepository } from "../infrastructure/persistence/jsonl/events.js";
import { JsonlQuarantineRepository } from "../infrastructure/persistence/jsonl/quarantine.js";
import { SqliteTaskRepository } from "../infrastructure/persistence/sqlite/tasks.js";
import { SqliteEventRepository } from "../infrastructure/persistence/sqlite/events.js";
import { SqliteQuarantineRepository } from "../infrastructure/persistence/sqlite/quarantine.js";

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
    queueService: new QueueService(taskRepo, quarantineRepo, systemIsoClock),
    insightsService: new InsightsService(taskRepo, eventRepo),
    doctorService: new DoctorService(taskRepo, quarantineRepo),
  };
}
