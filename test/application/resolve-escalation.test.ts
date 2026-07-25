import { describe, expect, it, vi, beforeEach } from "vitest";
import { ResolveEscalationUseCase } from "../../src/application/use-cases/decision/resolve-escalation.js";
import type { DecisionRecord } from "../../src/domain/decision/model.js";
import type { DecisionRepository } from "../../src/application/contracts/decision-repository.js";
import type { TaskRepository, EventRepository } from "../../src/domain/ports/repositories.js";

function mockClock(): () => string {
  return () => "2026-07-05T00:00:00.000Z";
}

function mockDecisionRepo(records: DecisionRecord[] = []): DecisionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockImplementation((id: string) => {
      const found = records.find((r) => r.id === id);
      return Promise.resolve(found ?? null);
    }),
    findByTask: vi.fn().mockResolvedValue([]),
    findSimilar: vi.fn().mockResolvedValue([]),
    listEscalated: vi.fn().mockResolvedValue(records.filter((r) => r.status === "escalated")),
    update: vi.fn().mockImplementation((id: string, patch: Partial<DecisionRecord>) => {
      const existing = records.find((r) => r.id === id);
      if (!existing) throw new Error(`Decision ${id} not found`);
      const updated = { ...existing, ...patch };
      return Promise.resolve(updated);
    }),
  };
}

function mockTaskRepo(): TaskRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    hasActiveDuplicateDedupeKey: vi.fn().mockResolvedValue(false),
    mergeOneTask: vi.fn().mockResolvedValue(true),
    getById: vi.fn().mockResolvedValue(null),
    runInTransaction: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };
}

function mockEventRepo(): EventRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    append: vi.fn(),
  };
}

function makeEscalatedRecord(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "esc_001",
    task_id: "task-1",
    decision_id: "d-1",
    context: "Need to choose a database",
    context_fingerprint: "choose database need",
    options: ["SQLite", "PostgreSQL"],
    chosen: null,
    reason: "No matching rules or historical precedent.",
    resolved_by: null,
    confidence: null,
    status: "escalated",
    created_at: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("ResolveEscalationUseCase", () => {
  let decisionRepo: DecisionRepository;
  let taskRepo: TaskRepository;
  let eventRepo: EventRepository;
  let useCase: ResolveEscalationUseCase;

  beforeEach(() => {
    decisionRepo = mockDecisionRepo();
    taskRepo = mockTaskRepo();
    eventRepo = mockEventRepo();
    useCase = new ResolveEscalationUseCase(decisionRepo, taskRepo, eventRepo, mockClock());
  });

  describe("resolve with task reset", () => {
    it("updates decision record with human resolution and resets task", async () => {
      const record = makeEscalatedRecord();
      decisionRepo = mockDecisionRepo([record]);
      useCase = new ResolveEscalationUseCase(decisionRepo, taskRepo, eventRepo, mockClock());

      const result = await useCase.execute("esc_001", "SQLite", "Standardize on SQLite per project rules", true);

      // 验证决策记录已更新
      expect(result.decision.chosen).toBe("SQLite");
      expect(result.decision.status).toBe("resolved");
      expect(result.decision.resolved_by).toBe("human");
      expect(result.decision.resolved_at).toBe("2026-07-05T00:00:00.000Z");
      expect(result.decision.reason).toContain("[Resolved by human]");
      expect(result.decision.reason).toContain("Standardize on SQLite per project rules");

      // 验证 task 被重置为 retry
      expect(taskRepo.mergeOneTask).toHaveBeenCalledOnce();
      const [taskId, mutator] = (taskRepo.mergeOneTask as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(taskId).toBe("task-1");

      // 验证 task mutation
      const mutated = mutator({
        task_id: "task-1",
        status: "awaiting_decision",
        prompt: "original prompt",
        attempt: 1,
      } as Record<string, unknown>);
      expect(mutated).not.toBeNull();
      if (mutated) {
        const task = mutated as Record<string, unknown>;
        expect(task.status).toBe("retry");
        expect(task.attempt).toBe(2);
        expect(task.prompt).toContain("[decision-resolved]");
        expect(task.prompt).toContain('chose "SQLite"');
        expect(task.prompt).toContain("Continue with this decision");
        expect(task._decision_id).toBe("esc_001");
      }

      // 验证事件记录
      expect(eventRepo.append).toHaveBeenCalledOnce();
      const event = (eventRepo.append as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(event.event).toBe("task_decision_resolved");
      expect(event.task_id).toBe("task-1");
      expect(event.escalation_id).toBe("esc_001");
      expect(event.chosen).toBe("SQLite");
    });
  });

  describe("resolve without task reset", () => {
    it("updates decision record but does not touch the task", async () => {
      const record = makeEscalatedRecord();
      decisionRepo = mockDecisionRepo([record]);
      useCase = new ResolveEscalationUseCase(decisionRepo, taskRepo, eventRepo, mockClock());

      const result = await useCase.execute("esc_001", "PostgreSQL", "Team preference", false);

      expect(result.decision.chosen).toBe("PostgreSQL");
      expect(result.decision.status).toBe("resolved");

      // task 不应该被触及
      expect(taskRepo.mergeOneTask).not.toHaveBeenCalled();
      expect(eventRepo.append).not.toHaveBeenCalled();
    });
  });

  describe("error cases", () => {
    it("throws when escalation ID is not found", async () => {
      await expect(
        useCase.execute("nonexistent", "A", "reason", true),
      ).rejects.toThrow("Escalation nonexistent not found");
    });

    it("handles task without mergeOneTask gracefully via fallback", async () => {
      const record = makeEscalatedRecord();
      decisionRepo = mockDecisionRepo([record]);
      // taskRepo without mergeOneTask — falls back to list+save
      const fallbackTaskRepo: TaskRepository = {
        list: vi.fn().mockResolvedValue([{
          task_id: "task-1",
          status: "awaiting_decision",
          prompt: "original prompt",
          attempt: 1,
        }]),
        save: vi.fn(),
        hasActiveDuplicateDedupeKey: vi.fn().mockResolvedValue(false),
        getById: vi.fn().mockResolvedValue(null),
        runInTransaction: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
      };
      const fallbackEventRepo = mockEventRepo();
      const fallbackUseCase = new ResolveEscalationUseCase(
        decisionRepo, fallbackTaskRepo, fallbackEventRepo, mockClock(),
      );

      const result = await fallbackUseCase.execute("esc_001", "SQLite", "Fallback test", true);

      expect(result.decision.chosen).toBe("SQLite");
      expect(fallbackTaskRepo.save).toHaveBeenCalledOnce();
      const saved = (fallbackTaskRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>[];
      expect(saved[0]!.status).toBe("retry");
      expect(saved[0]!.prompt).toContain("[decision-resolved]");
    });
  });

  describe("decision prompt injection", () => {
    it("appends decision context to the existing prompt", async () => {
      const record = makeEscalatedRecord();
      decisionRepo = mockDecisionRepo([record]);
      useCase = new ResolveEscalationUseCase(decisionRepo, taskRepo, eventRepo, mockClock());

      await useCase.execute("esc_001", "IndexedDB", "POC prefers browser-native API", true);

      const [, mutator] = (taskRepo.mergeOneTask as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const mutated = mutator({
        task_id: "task-1",
        status: "awaiting_decision",
        prompt: "Implement data persistence layer",
        attempt: 2,
      } as Record<string, unknown>);

      if (mutated) {
        const task = mutated as Record<string, unknown>;
        const prompt = task.prompt as string;
        expect(prompt.startsWith("Implement data persistence layer")).toBe(true);
        expect(prompt).toContain("\n\n[decision-resolved]");
        expect(prompt).toContain('Escalation esc_001: chose "IndexedDB"');
        expect(prompt).toContain("Continue with this decision");
      }
    });
  });
});
