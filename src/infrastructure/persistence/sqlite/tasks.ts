import { nowIso } from "../../clock/iso-clock.js";
import { ACTIVE_STATUSES, asTaskStatus, type TaskRecord, type TaskStatus } from "../../../domain/task.js";
import type { TaskRepository, TaskRowMergeResult } from "../../../domain/ports/repositories.js";
import { openDb } from "./db.js";

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly dbFile: string) {}

  async list(): Promise<TaskRecord[]> {
    const db = openDb(this.dbFile);
    const rows = db
      .prepare("SELECT payload FROM task_rows ORDER BY rowid ASC")
      .all() as Array<{ payload: string }>;
    return rows.map((row) => this.normalize(JSON.parse(row.payload) as TaskRecord));
  }

  async save(rows: TaskRecord[]): Promise<void> {
    const db = openDb(this.dbFile);
    const replace = db.prepare(
      "INSERT OR REPLACE INTO task_rows(storage_key, payload, updated_at) VALUES(?, ?, ?)"
    );
    const clear = db.prepare("DELETE FROM task_rows");
    const tx = db.transaction((input: TaskRecord[]) => {
      clear.run();
      input.forEach((row, idx) => {
        const key = String(row.task_id ?? `__idx_${idx}`);
        replace.run(key, JSON.stringify(row), nowIso());
      });
    });
    tx(rows);
  }

  /**
   * 单行读改写，在事务内执行，避免多 worker 并行时两个 list+save 互相覆盖整表。
   */
  async mergeOneTask(taskId: string, mutator: (row: TaskRecord) => TaskRowMergeResult): Promise<boolean> {
    const key = String(taskId);
    const db = openDb(this.dbFile);
    const select = db.prepare("SELECT payload FROM task_rows WHERE storage_key = ?");
    const update = db.prepare(
      "UPDATE task_rows SET payload = ?, updated_at = ? WHERE storage_key = ?"
    );
    const tx = db.transaction((id: string): boolean => {
      const got = select.get(id) as { payload: string } | undefined;
      if (!got) return false;
      const parsed = this.normalize(JSON.parse(got.payload) as TaskRecord);
      const next = mutator(parsed);
      if (next === null) return false;
      update.run(JSON.stringify(next), nowIso(), id);
      return true;
    });
    return tx(key);
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
