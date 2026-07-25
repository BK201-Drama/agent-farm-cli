import { describe, expect, it, vi, beforeEach } from "vitest";
import { DecisionEngine } from "../../src/application/engines/decision-engine.js";
import type { DecisionRepository } from "../../src/application/contracts/decision-repository.js";
import type { DecisionRequest, DecisionRule, DecisionRecord } from "../../src/domain/decision/model.js";

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
    findSimilar: vi.fn().mockImplementation(
      (_taskId: string, _fingerprint: string, _minSimilarity: number) => {
        return Promise.resolve(
          records
            .filter((r) => r.chosen !== null)
            .map((r) => ({ ...r, _similarity: 0.8 })),
        );
      },
    ),
    listEscalated: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation((id: string, patch: Partial<DecisionRecord>) => {
      const existing = records.find((r) => r.id === id);
      if (!existing) throw new Error(`Decision ${id} not found`);
      const updated = { ...existing, ...patch };
      return Promise.resolve(updated);
    }),
  };
}

const STORAGE_RULE: DecisionRule = {
  id: "storage-sqlite",
  description: "Use SQLite by default",
  context_patterns: ["database", "persist", "storage"],
  preferred_option: "SQLite",
  priority: 100,
};

describe("DecisionEngine", () => {
  let engine: DecisionEngine;

  beforeEach(() => {
    engine = new DecisionEngine([STORAGE_RULE], mockDecisionRepo(), 0.85, mockClock());
  });

  describe("evaluate", () => {
    it("auto-resolves via rule match when confidence >= threshold", async () => {
      // Context must match all 3 context_patterns for confidence 1.0
      const request: DecisionRequest = {
        task_id: "test-1",
        decision_id: "d-1",
        context: "Need to choose a database for persisting application storage data",
        options: ["SQLite", "PostgreSQL"],
        stage: "execute",
        attempt: 1,
      };
      const result = await engine.evaluate(request);
      expect(result.escalated).toBe(false);
      expect(result.chosen).toBe("SQLite");
      expect(result.resolved_by).toBe("rule");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("escalates when no rules match", async () => {
      const request: DecisionRequest = {
        task_id: "test-2",
        decision_id: "d-2",
        context: "What color should the button be?",
        options: ["Blue", "Red", "Green"],
        stage: "execute",
        attempt: 1,
      };
      const result = await engine.evaluate(request);
      expect(result.escalated).toBe(true);
      expect("escalation_id" in result).toBe(true);
      expect(result.reason).toContain("No matching rules");
    });

    it("resolves via history when rules don't match but similar decision exists", async () => {
      const historyRecord: DecisionRecord = {
        id: "hist-1",
        task_id: "old-task",
        decision_id: "old-d-1",
        context: "Need to choose button color",
        context_fingerprint: "button choose color",
        options: ["Blue", "Red", "Green"],
        chosen: "Blue",
        reason: "User prefers blue",
        resolved_by: "human",
        confidence: 1,
        status: "resolved",
        created_at: "2026-07-01T00:00:00.000Z",
      };

      const repo = mockDecisionRepo([historyRecord]);
      // Override findSimilar to return high similarity
      repo.findSimilar = vi.fn().mockResolvedValue([
        { ...historyRecord, _similarity: 0.9 },
      ]);

      const eng = new DecisionEngine([], repo, 0.85, mockClock());
      const request: DecisionRequest = {
        task_id: "test-3",
        decision_id: "d-3",
        context: "What color should the button be?",
        options: ["Blue", "Red", "Green"],
        stage: "execute",
        attempt: 1,
      };
      const result = await eng.evaluate(request);
      expect(result.escalated).toBe(false);
      expect(result.chosen).toBe("Blue");
      expect(result.resolved_by).toBe("history");
      expect(result.confidence).toBe(0.9);
    });

    it("escalates when history similarity is below threshold", async () => {
      const historyRecord: DecisionRecord = {
        id: "hist-2",
        task_id: "old-task",
        decision_id: "old-d-2",
        context: "Need to choose button color",
        context_fingerprint: "button choose color",
        options: ["Blue", "Red"],
        chosen: "Blue",
        reason: "test",
        resolved_by: "human",
        confidence: 1,
        status: "resolved",
        created_at: "2026-07-01T00:00:00.000Z",
      };

      const repo = mockDecisionRepo([historyRecord]);
      repo.findSimilar = vi.fn().mockResolvedValue([
        { ...historyRecord, _similarity: 0.75 }, // below 0.85
      ]);

      const eng = new DecisionEngine([], repo, 0.85, mockClock());
      const request: DecisionRequest = {
        task_id: "test-4",
        decision_id: "d-4",
        context: "Pick button color",
        options: ["Blue", "Red"],
        stage: "execute",
        attempt: 1,
      };
      const result = await eng.evaluate(request);
      expect(result.escalated).toBe(true);
    });
  });

  describe("resolveEscalation", () => {
    it("updates decision record with human resolution", async () => {
      const record: DecisionRecord = {
        id: "esc-1",
        task_id: "test-5",
        decision_id: "d-5",
        context: "test",
        context_fingerprint: "test",
        options: ["A", "B"],
        chosen: null,
        reason: "No match",
        resolved_by: null,
        confidence: null,
        status: "escalated",
        created_at: "2026-07-05T00:00:00.000Z",
      };

      const repo = mockDecisionRepo([record]);
      const eng = new DecisionEngine([], repo, 0.85, mockClock());
      const result = await eng.resolveEscalation("esc-1", "A", "User picked A");

      expect(result.chosen).toBe("A");
      expect(result.status).toBe("resolved");
      expect(result.resolved_by).toBe("human");
      expect(result.resolved_at).toBe("2026-07-05T00:00:00.000Z");
    });

    it("throws when escalation not found", async () => {
      const repo = mockDecisionRepo([]);
      const eng = new DecisionEngine([], repo, 0.85, mockClock());

      await expect(eng.resolveEscalation("nonexistent", "A", "reason"))
        .rejects.toThrow("not found");
    });
  });

  describe("getRules", () => {
    it("returns the rule base", () => {
      expect(engine.getRules()).toEqual([STORAGE_RULE]);
    });
  });
});
