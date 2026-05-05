import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { nowIso } from "../../clock/iso-clock.js";
import { readJsonl, writeJsonl } from "./jsonl-utils.js";
import { ACTIVE_STATUSES, asTaskStatus, type TaskRecord, type TaskStatus } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class JsonlTaskRepository implements TaskRepository {
  constructor(private readonly taskFile: string) {}

  async list(): Promise<TaskRecord[]> {
    const rows = await readJsonl(this.taskFile);
    return rows.map((row) => this.normalize(row as TaskRecord));
  }

  async save(rows: TaskRecord[]): Promise<void> {
    await writeJsonl(this.taskFile, rows);
  }

  async hasActiveDuplicateDedupeKey(dedupeKey: string, excludeTaskId: string): Promise<boolean> {
    const key = dedupeKey.trim();
    if (!key) return false;
    const stream = createReadStream(this.taskFile, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let row: TaskRecord;
        try {
          row = JSON.parse(trimmed) as TaskRecord;
        } catch {
          continue;
        }
        if (String(row.task_id ?? "") === excludeTaskId) continue;
        if (String(row.dedupe_key ?? "").trim() !== key) continue;
        if (ACTIVE_STATUSES.has(String(row.status ?? "") as TaskStatus)) return true;
      }
    } catch {
      return false;
    }
    return false;
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
