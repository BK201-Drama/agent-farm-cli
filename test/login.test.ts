import { describe, expect, it } from "vitest";
import type { IsoClock } from "../src/domain/ports/clock.js";
import type { WorkerSessionRepository } from "../src/application/contracts/worker-session-repository.js";
import { LoginUseCase } from "../src/application/use-cases/worker/login.js";

const FIXED_NOW = "2020-01-01T00:00:00.000Z";

const mockClock = (): string => FIXED_NOW;

describe("LoginUseCase", () => {
  it("creates a session when given valid worker id", async () => {
    const repo: WorkerSessionRepository = {
      save: async () => {},
    };
    const useCase = new LoginUseCase(repo, mockClock);
    const result = await useCase.execute("worker-1");

    expect(result.worker_id).toBe("worker-1");
    expect(result.session_token).toBeDefined();
    expect(result.login_at).toBe(FIXED_NOW);
  });

  it("throws when worker id is empty", async () => {
    const repo: WorkerSessionRepository = {
      save: async () => {},
    };
    const useCase = new LoginUseCase(repo, mockClock);

    await expect(useCase.execute("")).rejects.toThrow("worker_id is required");
  });

  it("generates unique session tokens", async () => {
    const repo: WorkerSessionRepository = {
      save: async () => {},
    };
    const useCase = new LoginUseCase(repo, mockClock);
    const result1 = await useCase.execute("worker-1");
    const result2 = await useCase.execute("worker-1");

    expect(result1.session_token).not.toBe(result2.session_token);
  });
});
