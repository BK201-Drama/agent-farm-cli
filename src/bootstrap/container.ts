import { QueueService } from "../application/facades/queue.js";
import { InsightsService } from "../application/facades/insights.js";
import { DoctorService } from "../application/facades/doctor.js";
import { StatusService } from "../application/facades/status.js";
import { systemIsoClock } from "../infrastructure/clock/iso-clock.js";
import { JsonlTaskRepository } from "../infrastructure/persistence/jsonl/tasks.js";
import { JsonlEventRepository } from "../infrastructure/persistence/jsonl/events.js";
import { JsonlQuarantineRepository } from "../infrastructure/persistence/jsonl/quarantine.js";
import { SqliteTaskRepository } from "../infrastructure/persistence/sqlite/tasks.js";
import { SqliteEventRepository } from "../infrastructure/persistence/sqlite/events.js";
import { SqliteQuarantineRepository } from "../infrastructure/persistence/sqlite/quarantine.js";
import { defaultContainerPorts, type ContainerPorts } from "./container-ports.js";
import { warnJsonlStorageIfNeeded } from "../domain/task/storage-policy.js";

export type StoragePaths = {
  storage?: "jsonl" | "sqlite";
  dbFile?: string;
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
};

export function createContainer(paths: StoragePaths, portOverrides?: Partial<ContainerPorts>) {
  const storage = paths.storage ?? "sqlite";
  warnJsonlStorageIfNeeded(storage);
  const dbFile = paths.dbFile ?? `${process.cwd()}/.agent-farm/queue/agent_farm.db`;
  const ports = defaultContainerPorts(portOverrides);
  const taskRepo = storage === "sqlite" ? new SqliteTaskRepository(dbFile) : new JsonlTaskRepository(paths.taskFile);
  const eventRepo = storage === "sqlite" ? new SqliteEventRepository(dbFile) : new JsonlEventRepository(paths.eventFile);
  const quarantineRepo =
    storage === "sqlite" ? new SqliteQuarantineRepository(dbFile) : new JsonlQuarantineRepository(paths.quarantineFile);
  return {
    taskRepo,
    eventRepo,
    quarantineRepo,
    ports,
    queueService: new QueueService(taskRepo, quarantineRepo, systemIsoClock),
    insightsService: new InsightsService(taskRepo, eventRepo),
    doctorService: new DoctorService(taskRepo, quarantineRepo, ports.gitWorkspace, eventRepo),
    statusService: new StatusService(taskRepo),
  };
}
