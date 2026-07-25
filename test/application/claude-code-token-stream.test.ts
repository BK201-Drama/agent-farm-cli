import { describe, it, expect } from "vitest";
import { createClaudeCodeJsonStreamObserver } from "../../src/infrastructure/claude-code/claude-code-json-stream.js";

describe("createClaudeCodeJsonStreamObserver — token extraction", () => {
  it("accumulates input_tokens and output_tokens from result events", () => {
    const obs = createClaudeCodeJsonStreamObserver();

    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "success", usage: { input_tokens: 2000, output_tokens: 500 } }));
    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "success", usage: { input_tokens: 1000, output_tokens: 250 } }));

    const snap = obs.snapshot();
    expect(snap.inputTokens).toBe(3000);
    expect(snap.outputTokens).toBe(750);
  });

  it("counts tokens from error result events too (for observability)", () => {
    const obs = createClaudeCodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "error_during_execution", usage: { input_tokens: 500, output_tokens: 0 } }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBe(500);
    expect(snap.outputTokens).toBe(0);
  });

  it("does not add tokens for non-result events", () => {
    const obs = createClaudeCodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });

  it("handles missing usage gracefully", () => {
    const obs = createClaudeCodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "success" }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
  });

  it("handles non-numeric usage values", () => {
    const obs = createClaudeCodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "success", usage: { input_tokens: "many", output_tokens: 100 } }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBe(100);
  });
});
