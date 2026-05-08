import type { WorkerSession, WorkerSessionRepository } from "../../application/contracts/worker-session-repository.js";

export class InMemoryWorkerSessionRepository implements WorkerSessionRepository {
  private sessions: WorkerSession[] = [];

  async save(session: WorkerSession): Promise<void> {
    this.sessions.push(session);
  }

  async list(): Promise<WorkerSession[]> {
    return [...this.sessions];
  }
}
