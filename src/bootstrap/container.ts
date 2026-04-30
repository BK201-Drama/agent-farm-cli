import { QueueService } from "../application/services/queue-service.js";
import { InsightsService } from "../application/services/insights-service.js";
import { DoctorService } from "../application/services/doctor-service.js";
import { JsonlTaskRepository } from "../infrastructure/persistence/jsonl/task-repository.js";
import { JsonlEventRepository } from "../infrastructure/persistence/jsonl/event-repository.js";
import { JsonlQuarantineRepository } from "../infrastructure/persistence/jsonl/quarantine-repository.js";

export type StoragePaths = {
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
};

export function createJsonlContainer(paths: StoragePaths) {
  const taskRepo = new JsonlTaskRepository(paths.taskFile);
  const eventRepo = new JsonlEventRepository(paths.eventFile);
  const quarantineRepo = new JsonlQuarantineRepository(paths.quarantineFile);
  return {
    taskRepo,
    eventRepo,
    quarantineRepo,
    queueService: new QueueService(taskRepo, quarantineRepo),
    insightsService: new InsightsService(taskRepo, eventRepo),
    doctorService: new DoctorService(taskRepo, quarantineRepo),
  };
}
