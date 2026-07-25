import { describe, expect, it, vi, beforeEach } from "vitest";
import { RequestDecisionUseCase } from "../../src/application/use-cases/decision/request-decision.js";
import type { DecisionEnginePort, DecisionRequest, DecisionRecord } from "../../src/domain/decision/model.js";
import type { DecisionRepository } from "../../src/application/contracts/decision-repository.js";
import type { TaskRepository, EventRepository } from "../../src/domain/ports/repositories.js";

function mockClock(): () => string {
  return () => "2026-07-05T00:00:00.000Z";
}

function mockDecisionEngine(): DecisionEnginePort {
  return {
    evaluate: vi.fn(),
    resolveEscalation: vi.fn(),
    getRules: vi.fn().mockReturnValue([]),
  };
}

function mockDecisionRepo(): DecisionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByTask: vi.fn().mockResolvedValue([]),
    findSimilar: vi.fn().mockResolvedValue([]),
    listEscalated: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  };
}

function mockTaskRepo(records: Record<string, unknown>[] = []): TaskRepository {
  return {
    list: vi.fn().mockResolvedValue(records),
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

const BASE_REQUEST: DecisionRequest = {
  task_id: "task-1",
  decision_id: "d-1",
  context: "Need to choose a database for persisting user data",
  options: ["SQLite", "PostgreSQL"],
  recommendation: "SQLite",
  stage: "execute",
  attempt: 1,
};

describe("RequestDecisionUseCase", () => {
  let engine: DecisionEnginePort;
  let decisionRepo: DecisionRepository;
  let taskRepo: TaskRepository;
  let eventRepo: EventRepository;
  let useCase: RequestDecisionUseCase;

  beforeEach(() => {
    engine = mockDecisionEngine();
    decisionRepo = mockDecisionRepo();
    taskRepo = mockTaskRepo();
    eventRepo = mockEventRepo();
    useCase = new RequestDecisionUseCase(engine, decisionRepo, taskRepo, eventRepo, mockClock());
  });

  describe("auto-resolve path", () => {
    it("persists a resolved DecisionRecord when engine auto-resolves", async () => {
      const autoResult = {
        decision_id: "d-1",
        chosen: "SQLite",
        reason: 'Rule "storage-sqlite": Use SQLite by default',
        resolved_by: "rule" as const,
        confidence: 1.0,
        escalated: false as const,
      };
      (engine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(autoResult);

      const result = await useCase.execute(BASE_REQUEST);

      expect(result.escalated).toBe(false);
      expect(result.chosen).toBe("SQLite");

      // 验证审计记录已保存
      expect(decisionRepo.save).toHaveBeenCalledOnce();
      const savedRecord = (decisionRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as DecisionRecord;
      expect(savedRecord.status).toBe("resolved");
      expect(savedRecord.chosen).toBe("SQLite");
      expect(savedRecord.resolved_by).toBe("rule");
      expect(savedRecord.confidence).toBe(1.0);
      expect(savedRecord.task_id).toBe("task-1");

      // 自动裁决不应该触发 task 状态变更
      expect(taskRepo.mergeOneTask).not.toHaveBeenCalled();
      expect(eventRepo.append).not.toHaveBeenCalled();
    });

    it("creates audit records with fingerprint", async () => {
      const autoResult = {
        decision_id: "d-2",
        chosen: "React",
        reason: "Rule matched",
        resolved_by: "rule" as const,
        confidence: 0.9,
        escalated: false as const,
      };
      (engine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(autoResult);

      await useCase.execute({
        ...BASE_REQUEST,
        decision_id: "d-2",
        context: "Which frontend framework to use for UI components?",
        options: ["React", "Vue"],
      });

      const savedRecord = (decisionRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as DecisionRecord;
      expect(savedRecord.context_fingerprint).toBeTruthy();
      expect(savedRecord.context_fingerprint.length).toBeGreaterThan(0);
      // fingerprint 应为空格分隔的 token 串
      expect(savedRecord.context_fingerprint).toMatch(/^[a-z0-9 ]+$/);
    });
  });

  describe("escalation path", () => {
    it("persists an escalated DecisionRecord and transitions task to awaiting_decision", async () => {
      const escalatedResult = {
        decision_id: "d-3",
        escalated: true as const,
        escalation_id: "esc_test_001",
        reason: "No matching rules or historical precedent.",
      };
      (engine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(escalatedResult);

      const result = await useCase.execute({
        ...BASE_REQUEST,
        decision_id: "d-3",
        context: "What color should the button be?",
        options: ["Blue", "Red"],
      });

      expect(result.escalated).toBe(true);
      expect("escalation_id" in result).toBe(true);
      if (result.escalated) {
        expect(result.escalation_id).toBe("esc_test_001");
      }

      // 验证审计记录
      const savedRecord = (decisionRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as DecisionRecord;
      expect(savedRecord.status).toBe("escalated");
      expect(savedRecord.chosen).toBeNull();
      expect(savedRecord.resolved_by).toBeNull();
      expect(savedRecord.id).toBe("esc_test_001");

      // 验证 task 状态变更
      expect(taskRepo.mergeOneTask).toHaveBeenCalledOnce();
      const [taskId, mutator] = (taskRepo.mergeOneTask as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(taskId).toBe("task-1");

      // 验证事件记录
      expect(eventRepo.append).toHaveBeenCalledOnce();
      const event = (eventRepo.append as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(event.event).toBe("task_awaiting_decision");
      expect(event.task_id).toBe("task-1");
      expect(event.escalation_id).toBe("esc_test_001");
    });

    it("injects _escalation_id and _decision_context into task extra fields", async () => {
      const escalatedResult = {
        decision_id: "d-4",
        escalated: true as const,
        escalation_id: "esc_context_001",
        reason: "Needs human input.",
      };
      (engine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(escalatedResult);

      await useCase.execute({
        ...BASE_REQUEST,
        decision_id: "d-4",
        context: "Pick storage engine",
        options: ["IndexedDB", "SQLite"],
      });

      const [, mutator] = (taskRepo.mergeOneTask as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // 模拟 task 被 merge
      const mutated = mutator({
        task_id: "task-1",
        status: "running",
        prompt: "original prompt",
      } as Record<string, unknown>);
      expect(mutated).not.toBeNull();
      if (mutated) {
        const task = mutated as Record<string, unknown>;
        expect(task.status).toBe("awaiting_decision");
        expect(task._escalation_id).toBe("esc_context_001");
        expect(task._decision_context).toBe("Pick storage engine");
        expect(task._decision_options).toBe('["IndexedDB","SQLite"]');
      }
    });
  });

  describe("edge cases", () => {
    it("handles history-based resolution with correct audit trail", async () => {
      const historyResult = {
        decision_id: "d-5",
        chosen: "Vitest",
        reason: "Historical decision #42 (85% similar): User chose Vitest",
        resolved_by: "history" as const,
        confidence: 0.85,
        escalated: false as const,
      };
      (engine.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(historyResult);

      const result = await useCase.execute({
        ...BASE_REQUEST,
        decision_id: "d-5",
      });

      expect(result.escalated).toBe(false);
      expect(result.resolved_by).toBe("history");

      const savedRecord = (decisionRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as DecisionRecord;
      expect(savedRecord.resolved_by).toBe("history");
      expect(savedRecord.status).toBe("resolved");
    });
  });
});
