import type { IsoClock } from "../../../domain/ports/clock.js";
import type { WorkerSession, WorkerSessionRepository } from "../../contracts/worker-session-repository.js";

export class LoginUseCase {
  constructor(
    private readonly repo: WorkerSessionRepository,
    private readonly clock: IsoClock,
  ) {}

  async execute(worker_id: string): Promise<WorkerSession> {
    if (!worker_id || worker_id.trim() === "") {
      throw new Error("worker_id is required");
    }
    const session: WorkerSession = {
      worker_id,
      session_token: crypto.randomUUID(),
      login_at: this.clock(),
    };
    await this.repo.save(session);
    return session;
  }
}
