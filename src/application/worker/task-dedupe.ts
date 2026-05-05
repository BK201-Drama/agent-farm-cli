import { ACTIVE_STATUSES, type JsonMap, type TaskStatus } from "../../domain/task.js";

export function hasDuplicateActiveDedupe(task: JsonMap, all: JsonMap[]): boolean {
  const key = String(task.dedupe_key ?? "").trim();
  if (!key) return false;
  const taskId = String(task.task_id ?? "");
  return all.some(
    (x) =>
      String(x.task_id ?? "") !== taskId &&
      ACTIVE_STATUSES.has(String(x.status ?? "") as TaskStatus) &&
      String(x.dedupe_key ?? "").trim() === key
  );
}
