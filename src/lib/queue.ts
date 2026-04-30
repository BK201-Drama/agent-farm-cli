import { nowIso, readJsonl, writeJsonl, type JsonMap } from "./jsonl.js";

export const ACTIVE_STATUSES = new Set([
  "queued",
  "retry",
  "claimed",
  "running",
  "review",
  "approved",
]);

export function ensureTaskShape(input: JsonMap): JsonMap {
  return {
    status: "queued",
    topic: "general",
    mode: "execute",
    created_at: nowIso(),
    started_at: null,
    ...input,
  };
}

export async function addTask(taskFile: string, task: JsonMap): Promise<JsonMap> {
  const rows = (await readJsonl(taskFile)).map(ensureTaskShape);
  const normalized = ensureTaskShape(task);
  const dedupeKey = String(normalized.dedupe_key ?? "").trim();
  if (dedupeKey) {
    const dup = rows.some(
      (row) =>
        ACTIVE_STATUSES.has(String(row.status ?? "")) &&
        String(row.dedupe_key ?? "").trim() === dedupeKey
    );
    if (dup) {
      throw new Error(`duplicate dedupe_key in active queue: ${dedupeKey}`);
    }
  }
  rows.push(normalized);
  await writeJsonl(taskFile, rows);
  return normalized;
}

export async function listTasks(taskFile: string): Promise<JsonMap[]> {
  return (await readJsonl(taskFile)).map(ensureTaskShape);
}

export async function claimTasks(taskFile: string, limit: number): Promise<JsonMap[]> {
  const rows = (await readJsonl(taskFile)).map(ensureTaskShape);
  const claimed: JsonMap[] = [];
  for (const row of rows) {
    if (claimed.length >= limit) break;
    if (!["queued", "retry"].includes(String(row.status))) continue;
    row.status = "claimed";
    row.claimed_at = nowIso();
    claimed.push({ ...row });
  }
  await writeJsonl(taskFile, rows);
  return claimed;
}

export async function updateStatus(
  taskFile: string,
  taskId: string,
  status: string,
  extra: JsonMap = {}
): Promise<boolean> {
  const rows = (await readJsonl(taskFile)).map(ensureTaskShape);
  let found = false;
  for (const row of rows) {
    if (String(row.task_id) !== taskId) continue;
    row.status = status;
    if (status === "running") {
      row.started_at = row.started_at || nowIso();
      row.heartbeat_at = nowIso();
    }
    if (["done", "failed", "cancelled", "blocked"].includes(status)) {
      row.completed_at = nowIso();
    }
    Object.assign(row, extra);
    found = true;
    break;
  }
  if (found) await writeJsonl(taskFile, rows);
  return found;
}

export async function reviewApprove(
  taskFile: string,
  taskId: string,
  reviewer: string,
  notes: string,
  spawnExecute: boolean
): Promise<JsonMap> {
  const rows = (await readJsonl(taskFile)).map(ensureTaskShape);
  const task = rows.find((x) => String(x.task_id) === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (String(task.status) !== "review") throw new Error(`task status must be review`);
  task.status = "done";
  task.reviewed_by = reviewer;
  task.review_notes = notes;
  task.completed_at = nowIso();
  let spawnedTaskId: string | null = null;
  if (spawnExecute && String(task.mode) === "plan") {
    spawnedTaskId = `${taskId}::exec::${Date.now()}`;
    rows.push(
      ensureTaskShape({
        task_id: spawnedTaskId,
        topic: task.topic,
        status: "queued",
        mode: "execute",
        parent_task_id: taskId,
        prompt:
          (task.execute_prompt as string | undefined) ??
          `Execute approved plan task ${taskId} with tests and validation.`,
      })
    );
  }
  await writeJsonl(taskFile, rows);
  return { ok: true, task_id: taskId, status: "done", spawned_execute_task_id: spawnedTaskId };
}

export async function reviewReject(
  taskFile: string,
  taskId: string,
  reviewer: string,
  reason: string,
  moveToRetry: boolean
): Promise<JsonMap> {
  const rows = (await readJsonl(taskFile)).map(ensureTaskShape);
  const task = rows.find((x) => String(x.task_id) === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (String(task.status) !== "review") throw new Error(`task status must be review`);
  task.reviewed_by = reviewer;
  task.reject_reason = reason;
  if (moveToRetry) {
    task.status = "retry";
    task.attempt = Number(task.attempt ?? 0) + 1;
    task.last_error = `review rejected: ${reason || "(no reason)"}`;
    task.prompt = `${String(task.prompt ?? "")}\n\n[review-fix]\n${reason}`;
  } else {
    task.status = "rejected";
  }
  await writeJsonl(taskFile, rows);
  return { ok: true, task_id: taskId, status: task.status };
}

export async function recoverStale(taskFile: string, leaseTimeoutSeconds: number): Promise<JsonMap> {
  const rows = (await readJsonl(taskFile)).map(ensureTaskShape);
  const now = Date.now();
  const recovered: string[] = [];
  for (const row of rows) {
    if (String(row.status) !== "running") continue;
    const heartbeat = String(row.heartbeat_at ?? row.started_at ?? "");
    const t = Date.parse(heartbeat);
    if (Number.isNaN(t)) continue;
    const age = (now - t) / 1000;
    if (age < leaseTimeoutSeconds) continue;
    row.status = "retry";
    row.attempt = Number(row.attempt ?? 0) + 1;
    row.last_error = `lease timeout recovered after ${Math.floor(age)}s`;
    row.recovered_at = nowIso();
    recovered.push(String(row.task_id));
  }
  await writeJsonl(taskFile, rows);
  return { ok: true, recovered_count: recovered.length, task_ids: recovered };
}

export async function quarantinePoison(
  taskFile: string,
  quarantineFile: string,
  maxAttempts: number
): Promise<JsonMap> {
  const rows = (await readJsonl(taskFile)).map(ensureTaskShape);
  const keep: JsonMap[] = [];
  const blocked: JsonMap[] = [];
  for (const row of rows) {
    const attempt = Number(row.attempt ?? 0);
    const status = String(row.status);
    if (["retry", "failed"].includes(status) && attempt >= maxAttempts) {
      blocked.push({
        ...row,
        status: "blocked",
        blocked_at: nowIso(),
        blocked_reason: `poison threshold reached: attempt=${attempt} >= ${maxAttempts}`,
      });
      continue;
    }
    keep.push(row);
  }
  if (blocked.length > 0) {
    const oldQ = await readJsonl(quarantineFile);
    await writeJsonl(quarantineFile, oldQ.concat(blocked));
    await writeJsonl(taskFile, keep);
  }
  return { ok: true, quarantined_count: blocked.length, task_ids: blocked.map((x) => x.task_id) };
}
