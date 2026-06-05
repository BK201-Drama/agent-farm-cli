import { nowIso } from "../../clock/iso-clock.js";
import { claimTasksFromRows, partitionPoisonQuarantine, recoverStaleInRows } from "../../../domain/task/board.js";
import { ACTIVE_STATUSES, asTaskStatus, type TaskRecord, type TaskStatus } from "../../../domain/task.js";
import type { TaskRepository, TaskRowMergeResult } from "../../../domain/ports/repositories.js";
import { openDb, withBusyRetry } from "./db.js";

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly dbFile: string) {}

  async list(): Promise<TaskRecord[]> {
    const db = openDb(this.dbFile);
    const rows = db.prepare("SELECT payload FROM task_rows ORDER BY rowid ASC").all() as Array<{ payload: string }>;
    return rows.map((row) => this.normalize(JSON.parse(row.payload) as TaskRecord));
  }

  async save(rows: TaskRecord[]): Promise<void> {
    const db = openDb(this.dbFile);
    const replace = db.prepare("INSERT OR REPLACE INTO task_rows(storage_key, payload, updated_at) VALUES(?, ?, ?)");
    const clear = db.prepare("DELETE FROM task_rows");
    const tx = db.transaction((input: TaskRecord[]) => {
      clear.run();
      input.forEach((row, idx) => {
        const key = String(row.task_id ?? `__idx_${idx}`);
        replace.run(key, JSON.stringify(row), nowIso());
      });
    });
    await withBusyRetry(db, () => tx(rows));
  }

  /**
   * better-sqlite3 的 `db.transaction(fn)` 要求 fn **同步**；claim 路径里是 async list/save，不能用其包装。
   * 用 BEGIN IMMEDIATE + await fn + COMMIT，在异步边界上保持与 jsonl 版「单段临界区」语义接近。
   */
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const db = openDb(this.dbFile);
    try {
      await withBusyRetry(db, () => {
        db.prepare("BEGIN IMMEDIATE").run();
      });
      const result = await fn();
      await withBusyRetry(db, () => {
        db.prepare("COMMIT").run();
      });
      return result;
    } catch (err) {
      try {
        await withBusyRetry(db, () => {
          db.prepare("ROLLBACK").run();
        });
      } catch {
        /* rollback 失败时忽略，抛出原始错误 */
      }
      throw err;
    }
  }

  /**
   * 单行读改写，在事务内执行，避免多 worker 并行时两个 list+save 互相覆盖整表。
   */
  async insertTask(task: TaskRecord): Promise<void> {
    const normalized = this.normalize(task);
    const key = String(normalized.task_id ?? "");
    if (!key) throw new Error("insertTask: task_id required");
    const db = openDb(this.dbFile);
    const insert = db.prepare("INSERT INTO task_rows(storage_key, payload, updated_at) VALUES(?, ?, ?)");
    await withBusyRetry(db, () => {
      insert.run(key, JSON.stringify(normalized), nowIso());
    });
  }

  async recoverStaleTasks(leaseTimeoutSeconds: number, nowIsoStr: string): Promise<string[]> {
    const db = openDb(this.dbFile);
    const rows = (
      db
        .prepare(
          "SELECT payload FROM task_rows WHERE json_extract(payload, '$.status') IN ('running', 'claimed') ORDER BY rowid ASC",
        )
        .all() as Array<{ payload: string }>
    ).map((row) => this.normalize(JSON.parse(row.payload) as TaskRecord));
    const { rows: next, recoveredIds } = recoverStaleInRows(rows, leaseTimeoutSeconds, Date.now(), nowIsoStr);
    if (recoveredIds.length === 0) return [];
    const idSet = new Set(recoveredIds);
    const update = db.prepare("UPDATE task_rows SET payload = ?, updated_at = ? WHERE storage_key = ?");
    const tx = db.transaction((updated: TaskRecord[]) => {
      for (const row of updated) {
        const key = String(row.task_id ?? "");
        if (!key || !idSet.has(key)) continue;
        update.run(JSON.stringify(row), nowIso(), key);
      }
    });
    await withBusyRetry(db, () => tx(next));
    return recoveredIds;
  }

  async quarantinePoisonTasks(maxAttempts: number, blockedAtIso: string): Promise<TaskRecord[]> {
    const db = openDb(this.dbFile);
    const rows = (
      db
        .prepare(
          "SELECT payload FROM task_rows WHERE json_extract(payload, '$.status') IN ('retry', 'failed') ORDER BY rowid ASC",
        )
        .all() as Array<{ payload: string }>
    ).map((row) => this.normalize(JSON.parse(row.payload) as TaskRecord));
    const { blocked } = partitionPoisonQuarantine(rows, maxAttempts, blockedAtIso);
    if (blocked.length === 0) return [];
    const del = db.prepare("DELETE FROM task_rows WHERE storage_key = ?");
    const tx = db.transaction((items: TaskRecord[]) => {
      for (const b of items) {
        const key = String(b.task_id ?? "");
        if (key) del.run(key);
      }
    });
    await withBusyRetry(db, () => tx(blocked));
    return blocked;
  }

  async cancelTasksInStatuses(
    fromStatuses: ReadonlySet<string>,
    reason: string,
    mutator: (task: TaskRecord) => TaskRowMergeResult,
  ): Promise<{ cancelled: string[]; skipped: Array<{ task_id: string; reason: string }> }> {
    const statuses = [...fromStatuses];
    const placeholders = statuses.map(() => "?").join(", ");
    const sql = `SELECT payload FROM task_rows WHERE json_extract(payload, '$.status') IN (${placeholders}) ORDER BY rowid ASC`;
    const db = openDb(this.dbFile);
    const rows = (db.prepare(sql).all(...statuses) as Array<{ payload: string }>).map((row) =>
      this.normalize(JSON.parse(row.payload) as TaskRecord),
    );
    const update = db.prepare("UPDATE task_rows SET payload = ?, updated_at = ? WHERE storage_key = ?");
    const tx = db.transaction(
      (
        input: TaskRecord[],
        statusesSet: ReadonlySet<string>,
        errReason: string,
        apply: (task: TaskRecord) => TaskRowMergeResult,
      ) => {
        const outCancelled: string[] = [];
        const outSkipped: Array<{ task_id: string; reason: string }> = [];
        for (const task of input) {
          const id = String(task.task_id ?? "");
          const st = String(task.status ?? "");
          if (!id || !statusesSet.has(st)) continue;
          try {
            const next = apply(task);
            if (next === null) {
              outSkipped.push({ task_id: id, reason: "mutator returned null" });
              continue;
            }
            const withReason = { ...next, last_error: errReason };
            update.run(JSON.stringify(withReason), nowIso(), id);
            outCancelled.push(id);
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            console.error(`[agent-farm] cancelTasksInStatuses: mutator failed for task ${id}: ${reason}`);
            outSkipped.push({
              task_id: id,
              reason,
            });
          }
        }
        return { cancelled: outCancelled, skipped: outSkipped };
      },
    );
    const result = await withBusyRetry(db, () => tx(rows, fromStatuses, reason, mutator));
    return result;
  }

  async claimTasks(limit: number, claimant: string, claimedAtIso: string): Promise<TaskRecord[]> {
    const db = openDb(this.dbFile);
    const selectClaimable = db.prepare(
      "SELECT payload FROM task_rows WHERE json_extract(payload, '$.status') IN ('queued', 'retry') ORDER BY rowid ASC",
    );
    const update = db.prepare("UPDATE task_rows SET payload = ?, updated_at = ? WHERE storage_key = ?");
    const tx = db.transaction((lim: number): TaskRecord[] => {
      const rows = (selectClaimable.all() as Array<{ payload: string }>).map((row) =>
        this.normalize(JSON.parse(row.payload) as TaskRecord),
      );
      const { claimed } = claimTasksFromRows(rows, lim, claimedAtIso, claimant);
      for (const c of claimed) {
        const key = String(c.task_id ?? "");
        if (!key) continue;
        update.run(JSON.stringify(c), nowIso(), key);
      }
      return claimed;
    });
    return await withBusyRetry(db, () => tx(limit));
  }

  async mergeOneTask(taskId: string, mutator: (row: TaskRecord) => TaskRowMergeResult): Promise<boolean> {
    const key = String(taskId);
    const db = openDb(this.dbFile);
    const select = db.prepare("SELECT payload FROM task_rows WHERE storage_key = ?");
    const update = db.prepare("UPDATE task_rows SET payload = ?, updated_at = ? WHERE storage_key = ?");
    const tx = db.transaction((id: string): boolean => {
      const got = select.get(id) as { payload: string } | undefined;
      if (!got) return false;
      const parsed = this.normalize(JSON.parse(got.payload) as TaskRecord);
      const next = mutator(parsed);
      if (next === null) return false;
      update.run(JSON.stringify(next), nowIso(), id);
      return true;
    });
    return await withBusyRetry(db, () => tx(key));
  }

  async hasActiveDuplicateDedupeKey(dedupeKey: string, excludeTaskId: string): Promise<boolean> {
    const key = dedupeKey.trim();
    if (!key) return false;
    const statuses = [...ACTIVE_STATUSES] as TaskStatus[];
    const placeholders = statuses.map(() => "?").join(", ");
    const sql = `
      SELECT 1 FROM task_rows
      WHERE trim(coalesce(json_extract(payload, '$.dedupe_key'), '')) = ?
        AND coalesce(json_extract(payload, '$.task_id'), '') != ?
        AND json_extract(payload, '$.status') IN (${placeholders})
      LIMIT 1
    `;
    const db = openDb(this.dbFile);
    const row = db.prepare(sql).get(key, excludeTaskId, ...statuses) as { 1?: number } | undefined;
    return row !== undefined;
  }

  async getById(taskId: string): Promise<TaskRecord | null> {
    const db = openDb(this.dbFile);
    const sql = "SELECT payload FROM task_rows WHERE storage_key = ?";
    const row = db.prepare(sql).get(taskId) as { payload: string } | undefined;
    if (!row) return null;
    return this.normalize(JSON.parse(row.payload) as TaskRecord);
  }

  private normalize(input: TaskRecord): TaskRecord {
    const base: TaskRecord = {
      status: "queued",
      topic: "general",
      mode: "execute",
      created_at: nowIso(),
      started_at: null,
      ...input,
    };
    base.status = asTaskStatus(input.status);
    return base;
  }
}
