import { describe, expect, it } from "vitest";
import { resolveAiReviewCommandTemplate } from "../src/application/worker/ai-review-template.js";

describe("resolveAiReviewCommandTemplate", () => {
  it("returns empty when skip_ai_review", () => {
    expect(resolveAiReviewCommandTemplate({ skip_ai_review: true, ai_review_command_template: "x" }, "g")).toBe("");
  });

  it("prefers per-task template over global", () => {
    expect(
      resolveAiReviewCommandTemplate({ ai_review_command_template: " per " }, "global")
    ).toBe("per");
  });

  it("falls back to global after trim", () => {
    expect(resolveAiReviewCommandTemplate({}, "  gl  ")).toBe("gl");
  });
});
