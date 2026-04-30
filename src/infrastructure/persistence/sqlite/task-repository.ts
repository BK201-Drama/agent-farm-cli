import { nowIso } from "../jsonl/jsonl-utils.js";
import { asTaskStatus, type TaskRecord } from "../../../domain/task.js";
import type { TaskRepository } from "../../../ports/repositories.js";
import { openDb } from "./sqlite-db.js";

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
