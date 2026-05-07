import type { EventRecord } from "../../../domain/event.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";

export function taskEvent(payload: EventRecord): EventRecord {
  return payload;
}

export async function appendTaskFailedRetry(
  eventRepo: EventRepository,
  clock: IsoClock,
  taskId: string,
  attemptPlus1: number,
  stage: "execute" | "verify" | "ai_review",
): Promise<void> {
  await eventRepo.append(
    taskEvent({
      ts: clock(),
      event: "task_failed",
      task_id: taskId,
      attempt: attemptPlus1,
      stage,
    }),
  );
  await eventRepo.append(
    taskEvent({
      ts: clock(),
      event: "task_retry",
      task_id: taskId,
      attempt: attemptPlus1,
      stage,
    }),
  );
}
