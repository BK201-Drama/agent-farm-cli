import type { JsonMap } from "./task.js";

export type EventRecord = JsonMap & {
  ts?: string;
  event?: string;
  task_id?: string;
};
