import { nowIso } from "../../clock/iso-clock.js";
import type { TaskRecord } from "../../../domain/task.js";
import type { QuarantineRepository } from "../../../domain/ports/repositories.js";
import { openDb } from "./db.js";

export class SqliteQuarantineRepository implements QuarantineRepository {
  constructor(private readonly dbFile: string) {}

  async list(): Promise<TaskRecord[]> {
    const db = openDb(this.dbFile);
    const rows = db
      .prepare("SELECT payload FROM quarantine_rows ORDER BY id ASC")
      .all() as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as TaskRecord);
  }

  async append(rows: TaskRecord[]): Promise<void> {
    const db = openDb(this.dbFile);
    const insert = db.prepare("INSERT INTO quarantine_rows(payload, created_at) VALUES(?, ?)");
    const tx = db.transaction((input: TaskRecord[]) => {
      for (const row of input) {
        insert.run(JSON.stringify(row), nowIso());
      }
    });
    tx(rows);
  }
}
