import { describe, expect, it } from "vitest";
import { validateTaskJsonBeforeEnqueue } from "../../src/application/wave/validate-task-json.js";

describe("validateTaskJsonBeforeEnqueue", () => {
  it("rejects short prompt", async () => {
    await expect(
      validateTaskJsonBeforeEnqueue({
        task_id: "t1",
        dedupe_key: "d1",
        mode: "execute",
        prompt: "too short",
        acceptance_criteria: "npm test",
      }),
    ).rejects.toThrow(/过短/);
  });
});
