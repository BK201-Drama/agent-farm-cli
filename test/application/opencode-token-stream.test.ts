import { describe, it, expect } from "vitest";
import { createOpencodeJsonStreamObserver } from "../../src/infrastructure/opencode/opencode-json-stream.js";

describe("createOpencodeJsonStreamObserver — token extraction", () => {
  it("accumulates input_tokens and output_tokens from result events", () => {
    const obs = createOpencodeJsonStreamObserver();

    obs.onStdoutLine(JSON.stringify({ type: "result", usage: { input_tokens: 1500, output_tokens: 300 } }));
    obs.onStdoutLine(JSON.stringify({ type: "result", usage: { input_tokens: 800, output_tokens: 200 } }));
    obs.onStdoutLine(JSON.stringify({ type: "assistant", content: "hello" }));

    const snap = obs.snapshot();
    expect(snap.inputTokens).toBe(1500 + 800);
    expect(snap.outputTokens).toBe(300 + 200);
  });

  it("handles result events without usage field gracefully", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", text: "done" }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });

  it("skips non-numeric usage values", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", usage: { input_tokens: "abc", output_tokens: 100 } }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBe(100);
  });

  it("handles null usage gracefully", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", usage: null }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });

  it("does not add tokens when no result events seen", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "assistant", content: "hello" }));
    obs.onStdoutLine(JSON.stringify({ type: "tool_call", tool: "read" }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });
});
