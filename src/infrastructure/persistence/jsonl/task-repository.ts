import { nowIso, readJsonl, writeJsonl } from "./jsonl-utils.js";
import { asTaskStatus, type TaskRecord } from "../../../domain/task.js";
import type { TaskRepository } from "../../../ports/repositories.js";

export class JsonlTaskRepository implements TaskRepository {
  constructor(private readonly taskFile: string) {}

  async list(): Promise<TaskRecord[]> {
    const rows = await readJsonl(this.taskFile);
    return rows.map((row) => this.normalize(row as TaskRecord));
  }

  async save(rows: TaskRecord[]): Promise<void> {
    await writeJsonl(this.taskFile, rows);
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
