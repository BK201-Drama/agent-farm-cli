import { describe, expect, it } from "vitest";
import { isAllowedTaskTransition } from "../src/domain/task/transitions.js";

describe("isAllowedTaskTransition", () => {
  it("allows queued -> claimed", () => {
    expect(isAllowedTaskTransition("queued", "claimed")).toBe(true);
  });

  it("allows running -> review and running -> retry", () => {
    expect(isAllowedTaskTransition("running", "review")).toBe(true);
    expect(isAllowedTaskTransition("running", "retry")).toBe(true);
  });

  it("allows review -> approved -> done chain used by worker auto-approve", () => {
    expect(isAllowedTaskTransition("review", "approved")).toBe(true);
    expect(isAllowedTaskTransition("approved", "done")).toBe(true);
  });

  it("allows review -> done directly", () => {
    expect(isAllowedTaskTransition("review", "done")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(isAllowedTaskTransition("done", "running")).toBe(false);
    expect(isAllowedTaskTransition("blocked", "queued")).toBe(false);
  });

  it("allows admin batch cancel paths", () => {
    expect(isAllowedTaskTransition("running", "cancelled")).toBe(true);
    expect(isAllowedTaskTransition("claimed", "cancelled")).toBe(true);
    expect(isAllowedTaskTransition("review", "cancelled")).toBe(true);
    expect(isAllowedTaskTransition("approved", "cancelled")).toBe(true);
  });
});
