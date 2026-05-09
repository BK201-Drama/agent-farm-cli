import { describe, expect, it } from "vitest";
import { isAllowedTaskTransition } from "../../src/domain/task/transitions.js";
import { TASK_STATUSES, type TaskStatus } from "../../src/domain/task/model.js";

describe("isAllowedTaskTransition", () => {
  describe("legal transitions", () => {
    it("allows queued -> claimed, cancelled, blocked", () => {
      expect(isAllowedTaskTransition("queued", "claimed")).toBe(true);
      expect(isAllowedTaskTransition("queued", "cancelled")).toBe(true);
      expect(isAllowedTaskTransition("queued", "blocked")).toBe(true);
    });

    it("allows retry -> claimed, cancelled, blocked", () => {
      expect(isAllowedTaskTransition("retry", "claimed")).toBe(true);
      expect(isAllowedTaskTransition("retry", "cancelled")).toBe(true);
      expect(isAllowedTaskTransition("retry", "blocked")).toBe(true);
    });

    it("allows claimed -> running, retry, failed, blocked, cancelled", () => {
      expect(isAllowedTaskTransition("claimed", "running")).toBe(true);
      expect(isAllowedTaskTransition("claimed", "retry")).toBe(true);
      expect(isAllowedTaskTransition("claimed", "failed")).toBe(true);
      expect(isAllowedTaskTransition("claimed", "blocked")).toBe(true);
      expect(isAllowedTaskTransition("claimed", "cancelled")).toBe(true);
    });

    it("allows running -> review, retry, failed, blocked, cancelled", () => {
      expect(isAllowedTaskTransition("running", "review")).toBe(true);
      expect(isAllowedTaskTransition("running", "retry")).toBe(true);
      expect(isAllowedTaskTransition("running", "failed")).toBe(true);
      expect(isAllowedTaskTransition("running", "blocked")).toBe(true);
      expect(isAllowedTaskTransition("running", "cancelled")).toBe(true);
    });

    it("allows review -> approved, rejected, done, failed, blocked, cancelled", () => {
      expect(isAllowedTaskTransition("review", "approved")).toBe(true);
      expect(isAllowedTaskTransition("review", "rejected")).toBe(true);
      expect(isAllowedTaskTransition("review", "done")).toBe(true);
      expect(isAllowedTaskTransition("review", "failed")).toBe(true);
      expect(isAllowedTaskTransition("review", "blocked")).toBe(true);
      expect(isAllowedTaskTransition("review", "cancelled")).toBe(true);
    });

    it("allows approved -> done, cancelled", () => {
      expect(isAllowedTaskTransition("approved", "done")).toBe(true);
      expect(isAllowedTaskTransition("approved", "cancelled")).toBe(true);
    });

    it("allows rejected -> retry, blocked", () => {
      expect(isAllowedTaskTransition("rejected", "retry")).toBe(true);
      expect(isAllowedTaskTransition("rejected", "blocked")).toBe(true);
    });

    it("allows failed -> retry, blocked, cancelled", () => {
      expect(isAllowedTaskTransition("failed", "retry")).toBe(true);
      expect(isAllowedTaskTransition("failed", "blocked")).toBe(true);
      expect(isAllowedTaskTransition("failed", "cancelled")).toBe(true);
    });

    it("allows same-state transitions", () => {
      for (const status of TASK_STATUSES) {
        expect(isAllowedTaskTransition(status, status)).toBe(true);
      }
    });
  });

  describe("illegal transitions", () => {
    it("rejects done -> any state except self (terminal)", () => {
      for (const to of TASK_STATUSES) {
        if (to === "done") continue;
        expect(isAllowedTaskTransition("done", to)).toBe(false);
      }
      expect(isAllowedTaskTransition("done", "running")).toBe(false);
    });

    it("rejects cancelled -> any state except self (terminal)", () => {
      for (const to of TASK_STATUSES) {
        if (to === "cancelled") continue;
        expect(isAllowedTaskTransition("cancelled", to)).toBe(false);
      }
    });

    it("rejects blocked -> any state except self (terminal)", () => {
      for (const to of TASK_STATUSES) {
        if (to === "blocked") continue;
        expect(isAllowedTaskTransition("blocked", to)).toBe(false);
      }
      expect(isAllowedTaskTransition("blocked", "queued")).toBe(false);
    });

    it("rejects reversed and skip transitions", () => {
      expect(isAllowedTaskTransition("running", "queued")).toBe(false);
      expect(isAllowedTaskTransition("review", "running")).toBe(false);
      expect(isAllowedTaskTransition("approved", "review")).toBe(false);
      expect(isAllowedTaskTransition("running", "claimed")).toBe(false);
    });
  });

  describe("boundary cases", () => {
    it("returns false for null/undefined from status", () => {
      expect(isAllowedTaskTransition(null as unknown as TaskStatus, "queued")).toBe(false);
      expect(isAllowedTaskTransition(undefined as unknown as TaskStatus, "queued")).toBe(false);
    });

    it("returns false for null/undefined to status", () => {
      expect(isAllowedTaskTransition("queued", null as unknown as TaskStatus)).toBe(false);
      expect(isAllowedTaskTransition("queued", undefined as unknown as TaskStatus)).toBe(false);
    });

    it("returns false for invalid status strings", () => {
      expect(isAllowedTaskTransition("queued", "invalid" as TaskStatus)).toBe(false);
      expect(isAllowedTaskTransition("invalid" as TaskStatus, "running")).toBe(false);
    });
  });
});
