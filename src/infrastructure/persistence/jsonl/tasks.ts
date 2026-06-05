import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { nowIso } from "../../clock/iso-clock.js";
import { readJsonl, writeJsonl } from "./jsonl-utils.js";
import { ACTIVE_STATUSES, asTaskStatus, type TaskRecord, type TaskStatus } from "../../../domain/task.js";
import type { TaskRepository, TaskRowMergeResult } from "../../../domain/ports/repositories.js";
import { appendJsonl } from "./jsonl-utils.js";
import { claimTasksFromRows } from "../../../domain/task/board.js";

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
    } catch (err) {
      console.error(`[agent-farm] failed to read ${this.taskFile} for dedupe check:`, err instanceof Error ? err.message : String(err));
      return false;
    }
    return false;
  }

  async getById(taskId: string): Promise<TaskRecord | null> {
    const rows = await readJsonl(this.taskFile);
    const found = rows.find((row) => String(row.task_id ?? "") === taskId);
    return found ? this.normalize(found as TaskRecord) : null;
  }

  async insertTask(task: TaskRecord): Promise<void> {
    const normalized = this.normalize(task);
    await appendJsonl(this.taskFile, normalized);
  }

  async mergeOneTask(taskId: string, mutator: (row: TaskRecord) => TaskRowMergeResult): Promise<boolean> {
    const key = String(taskId);
    const rows = await this.list();
    const idx = rows.findIndex((r) => String(r.task_id) === key);
    if (idx < 0) return false;
    const next = mutator(rows[idx]!);
    if (next === null) return false;
    rows[idx] = this.normalize(next);
    await this.save(rows);
    return true;
  }

  async claimTasks(limit: number, claimant: string, claimedAtIso: string): Promise<TaskRecord[]> {
    const rows = await this.list();
    const { rows: next, claimed } = claimTasksFromRows(rows, limit, claimedAtIso, claimant);
    await this.save(next);
    return claimed;
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
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
