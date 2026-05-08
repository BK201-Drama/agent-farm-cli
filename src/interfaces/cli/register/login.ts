import type { Command } from "commander";
import { systemIsoClock } from "../../../infrastructure/clock/iso-clock.js";
import { print } from "../print.js";
import { LoginUseCase } from "../../../application/use-cases/worker/login.js";
import { InMemoryWorkerSessionRepository } from "../../../infrastructure/worker/in-memory-worker-session-repository.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .argument("<worker_id>", "worker identifier")
    .action(async (worker_id: string) => {
      const repo = new InMemoryWorkerSessionRepository();
      const useCase = new LoginUseCase(repo, systemIsoClock);
      const session = await useCase.execute(worker_id);
      print({ ok: true, session });
    });
}
