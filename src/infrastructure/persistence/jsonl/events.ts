import { appendJsonl, readJsonl } from "./jsonl-utils.js";
import type { EventRecord } from "../../../domain/event.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";

export class JsonlEventRepository implements EventRepository {
  constructor(private readonly filePath: string) {}

  async list(): Promise<EventRecord[]> {
    return (await readJsonl(this.filePath)) as EventRecord[];
  }

  async append(event: EventRecord): Promise<void> {
    await appendJsonl(this.filePath, event);
  }
}
