import { describe, expect, it } from "vitest";
import {
  createOpencodeJsonStreamObserver,
  ensureOpencodeRunFormatJson,
  stripOpencodeHealAppendix,
} from "../../src/infrastructure/opencode/opencode-json-stream.js";

describe("ensureOpencodeRunFormatJson", () => {
  it("inserts --format json after opencode-ai run", () => {
    expect(ensureOpencodeRunFormatJson('npx --prefix="$R" opencode-ai run --dir "$W" x')).toContain(
      "opencode-ai run --format json",
    );
  });

  it("does not double-insert", () => {
    const c = "opencode-ai run --format json --dir . p";
    expect(ensureOpencodeRunFormatJson(c)).toBe(c);
  });

  it("leaves non-opencode commands unchanged", () => {
    expect(ensureOpencodeRunFormatJson("echo 1")).toBe("echo 1");
  });
});

describe("stripOpencodeHealAppendix", () => {
  it("removes trailing [opencode-heal] block", () => {
    const p = 'do work\n\n[opencode-heal]\n{"hints":[]}';
    expect(stripOpencodeHealAppendix(p)).toBe("do work");
  });
});

describe("createOpencodeJsonStreamObserver", () => {
  it("collects error-shaped JSON and emits rate-limit hint", () => {
    const o = createOpencodeJsonStreamObserver();
    o.onStdoutLine(JSON.stringify({ type: "error", message: "429 rate limit exceeded" }));
    const h = o.healAppendixForRetry();
    expect(h).toContain("429");
    expect(h).toContain("限流");
    expect(o.snapshot().errorSnippets.length).toBeGreaterThan(0);
  });

  it("records non-JSON stderr-like error lines", () => {
    const o = createOpencodeJsonStreamObserver();
    o.onStderrLine("Error: permission denied for workspace");
    const h = o.healAppendixForRetry();
    expect(h.toLowerCase()).toContain("permission");
    expect(h).toContain("dangerously-skip-permissions");
  });
});
