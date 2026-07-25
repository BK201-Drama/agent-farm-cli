import { describe, expect, it } from "vitest";
import { parseLlmDecisionOutput } from "../../src/application/engines/llm-decision-resolver.js";

describe("parseLlmDecisionOutput", () => {
  it("parses valid JSON verdict on last line", () => {
    const output = `Some reasoning text...
The best option is SQLite because it's lightweight.
{"chosen": "SQLite", "reason": "SQLite is the project standard for local persistence", "confidence": 0.92}`;

    const result = parseLlmDecisionOutput(output, "d-1");
    expect(result).not.toBeNull();
    expect(result!.chosen).toBe("SQLite");
    expect(result!.reason).toBe("SQLite is the project standard for local persistence");
    expect(result!.confidence).toBe(0.92);
    expect(result!.resolved_by).toBe("llm");
    expect(result!.escalated).toBe(false);
  });

  it("returns null for empty output", () => {
    expect(parseLlmDecisionOutput("", "d-1")).toBeNull();
    expect(parseLlmDecisionOutput("   \n  ", "d-1")).toBeNull();
  });

  it("returns null when confidence is below 0.5", () => {
    const output = '{"chosen": "SQLite", "reason": "uncertain", "confidence": 0.3}';
    expect(parseLlmDecisionOutput(output, "d-1")).toBeNull();
  });

  it("returns null when chosen is missing", () => {
    const output = '{"reason": "no preference", "confidence": 0.8}';
    expect(parseLlmDecisionOutput(output, "d-1")).toBeNull();
  });

  it("returns null when last line is not valid JSON", () => {
    const output = "Some unstructured text without JSON";
    expect(parseLlmDecisionOutput(output, "d-1")).toBeNull();
  });

  it("clamps confidence > 1 to 1.0", () => {
    const output1 = '{"chosen": "A", "reason": "ok", "confidence": 1.5}';
    expect(parseLlmDecisionOutput(output1, "d-1")!.confidence).toBe(1);
  });

  it("returns null for negative confidence (below 0.5 threshold)", () => {
    const output = '{"chosen": "A", "reason": "ok", "confidence": -0.5}';
    expect(parseLlmDecisionOutput(output, "d-1")).toBeNull();
  });

  it("only parses the last line as JSON", () => {
    const output = `{"some": "other json"}
{"chosen": "SQLite", "reason": "final answer", "confidence": 0.88}`;

    const result = parseLlmDecisionOutput(output, "d-2");
    expect(result).not.toBeNull();
    expect(result!.chosen).toBe("SQLite");
    expect(result!.confidence).toBe(0.88);
  });
});
