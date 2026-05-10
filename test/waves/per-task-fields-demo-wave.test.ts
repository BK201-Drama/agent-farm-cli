import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const wavePath = join(repoRoot, "test/fixtures/waves/per-task-fields-demo.json");

describe("test/fixtures/waves/per-task-fields-demo.json", () => {
  it("is a non-empty array", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThan(0);
  });

  it("each item is an object with required task_id, dedupe_key, prompt", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    for (const t of raw) {
      expect(t && typeof t === "object" && !Array.isArray(t)).toBe(true);
      const o = t as Record<string, unknown>;
      expect(String(o.task_id ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.dedupe_key ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.prompt ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("mode is plan or execute when present", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    for (const t of raw) {
      const o = t as Record<string, unknown>;
      if (o.mode !== undefined && o.mode !== null && o.mode !== "") {
        expect(["plan", "execute"]).toContain(o.mode);
      }
    }
  });

  it("includes both plan and execute modes", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    const modes = raw.map((t) => (t as { mode?: string }).mode);
    expect(modes).toContain("plan");
    expect(modes).toContain("execute");
  });

  it("per-task optional fields have correct types when present", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    for (const t of raw) {
      const o = t as Record<string, unknown>;
      if (o.priority !== undefined && o.priority !== null) {
        expect(typeof o.priority).toBe("number");
      }
      if (o.acceptance_criteria !== undefined && o.acceptance_criteria !== null) {
        expect(typeof o.acceptance_criteria).toBe("string");
      }
      if (o.ai_review_command_template !== undefined && o.ai_review_command_template !== null) {
        expect(typeof o.ai_review_command_template).toBe("string");
      }
      if (o.skip_ai_review !== undefined && o.skip_ai_review !== null) {
        expect(typeof o.skip_ai_review).toBe("boolean");
      }
      if (o.topic !== undefined && o.topic !== null) {
        expect(typeof o.topic).toBe("string");
      }
    }
  });

  it("at least one task demonstrates per-task override fields", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    const hasAiReviewCmd = raw.some(
      (t) => typeof (t as Record<string, unknown>).ai_review_command_template === "string"
    );
    const hasSkipAiReview = raw.some(
      (t) => typeof (t as Record<string, unknown>).skip_ai_review === "boolean"
    );
    const hasAcceptanceCriteria = raw.some(
      (t) => typeof (t as Record<string, unknown>).acceptance_criteria === "string"
    );
    expect(hasAiReviewCmd || hasSkipAiReview || hasAcceptanceCriteria).toBe(true);
  });
});
