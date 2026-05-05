import { nowIso } from "../../clock/iso-clock.js";
import type { EventRecord } from "../../../domain/event.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";
import { openDb } from "./db.js";

export class SqliteEventRepository implements EventRepository {
  constructor(private readonly dbFile: string) {}

  async list(): Promise<EventRecord[]> {
    const db = openDb(this.dbFile);
    const rows = db.prepare("SELECT payload FROM events ORDER BY id ASC").all() as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as EventRecord);
  }

  async append(event: EventRecord): Promise<void> {
    const db = openDb(this.dbFile);
    db.prepare("INSERT INTO events(payload, created_at) VALUES(?, ?)").run(JSON.stringify(event), nowIso());
  }
}
