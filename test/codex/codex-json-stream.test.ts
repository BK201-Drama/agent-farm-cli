import { describe, expect, it } from "vitest";
import {
  createCodexJsonStreamObserver,
  ensureCodexExecJson,
  stripCodexHealAppendix,
} from "../../src/infrastructure/codex/codex-json-stream.js";

describe("ensureCodexExecJson", () => {
  it("inserts --json after codex exec", () => {
    expect(ensureCodexExecJson("codex exec --ephemeral {prompt}")).toContain("codex exec --json");
  });

  it("does not double-insert", () => {
    const c = "codex exec --json --ephemeral p";
    expect(ensureCodexExecJson(c)).toBe(c);
  });

  it("leaves non-codex commands unchanged", () => {
    expect(ensureCodexExecJson("echo 1")).toBe("echo 1");
  });
});

describe("stripCodexHealAppendix", () => {
  it("removes trailing [codex-heal] block", () => {
    const p = 'do work\n\n[codex-heal]\n{"hints":[]}';
    expect(stripCodexHealAppendix(p)).toBe("do work");
  });
});

describe("createCodexJsonStreamObserver", () => {
  it("collects error-shaped JSON and emits auth hint", () => {
    const o = createCodexJsonStreamObserver();
    o.onStdoutLine(JSON.stringify({ type: "error", message: "unauthorized login required" }));
    const h = o.healAppendixForRetry();
    expect(h.toLowerCase()).toContain("auth");
    expect(h).toContain("codex login");
    expect(o.snapshot().errorSnippets.length).toBeGreaterThan(0);
  });

  it("records rate-limit style lines", () => {
    const o = createCodexJsonStreamObserver();
    o.onStderrLine("Error: 429 rate limit exceeded");
    const h = o.healAppendixForRetry();
    expect(h).toContain("限流");
  });
});
