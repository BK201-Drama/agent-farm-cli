import { describe, expect, it } from "vitest";
import { validateWaveItem } from "../../src/application/wave/wave-validate.js";

describe("wave-validate", () => {
  it("rejects execute without acceptance_criteria", () => {
    expect(() =>
      validateWaveItem(
        {
          task_id: "t1",
          dedupe_key: "d1",
          mode: "execute",
          prompt: "仓库根 x。先 Read src/foo.ts。做某事。验收：npm test",
        },
        "test 第 1 项",
      ),
    ).toThrow(/acceptance_criteria/);
  });

  it("accepts execute with paths and acceptance_criteria", () => {
    const warnings = validateWaveItem(
      {
        task_id: "t1",
        dedupe_key: "d1",
        mode: "execute",
        prompt: "仓库根 x。先 Read src/foo.ts。禁止超过 10 分钟无任何 git diff；每步后 git status。\n\n验收：npm test",
        acceptance_criteria: "npm run check && npm test",
      },
      "test 第 1 项",
    );
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("accepts verify mode with acceptance_criteria and verify hint in prompt", () => {
    const warnings = validateWaveItem(
      {
        task_id: "v1",
        dedupe_key: "d-v",
        mode: "verify",
        prompt: "仓库根 x。先 Read src/foo.ts。运行验收检查 npm test，并确认无回归。",
        acceptance_criteria: "npm test",
      },
      "test verify",
    );
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("strict mode errors on missing path hint", () => {
    const prev = process.env.AGENT_FARM_PROMPT_LINT_STRICT;
    process.env.AGENT_FARM_PROMPT_LINT_STRICT = "1";
    try {
      expect(() =>
        validateWaveItem(
          {
            task_id: "t1",
            dedupe_key: "d1",
            mode: "execute",
            prompt: "x".repeat(50),
            acceptance_criteria: "npm test",
          },
          "test 第 1 项",
          { strictPrompt: true },
        ),
      ).toThrow(/先读路径/);
    } finally {
      if (prev === undefined) delete process.env.AGENT_FARM_PROMPT_LINT_STRICT;
      else process.env.AGENT_FARM_PROMPT_LINT_STRICT = prev;
    }
  });
});
