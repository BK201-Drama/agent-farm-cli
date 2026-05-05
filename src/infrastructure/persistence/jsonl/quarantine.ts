import { readJsonl, writeJsonl } from "./jsonl-utils.js";
import type { TaskRecord } from "../../../domain/task.js";
import type { QuarantineRepository } from "../../../domain/ports/repositories.js";

export class JsonlQuarantineRepository implements QuarantineRepository {
  constructor(private readonly filePath: string) {}

  async list(): Promise<TaskRecord[]> {
    return (await readJsonl(this.filePath)) as TaskRecord[];
  }

  async append(rows: TaskRecord[]): Promise<void> {
    const oldRows = await this.list();
    await writeJsonl(this.filePath, oldRows.concat(rows));
  }
}
