import { describe, expect, it } from "vitest";
import {
  commandLooksLikeCursorAgentRun,
  createCursorAgentJsonStreamObserver,
  ensureCursorAgentStreamJson,
  stripCursorAgentHealAppendix,
} from "../../src/infrastructure/cursor-agent/cursor-agent-json-stream.js";
import { EXECUTOR_PRESETS, EXECUTOR_ALIASES } from "../../src/application/use-cases/project/executor-presets.js";

describe("commandLooksLikeCursorAgentRun", () => {
  it("matches agent -p", () => {
    expect(commandLooksLikeCursorAgentRun("agent -p --force --trust {prompt}")).toBe(true);
  });

  it("matches cursor-agent --print", () => {
    expect(commandLooksLikeCursorAgentRun("cursor-agent --print --force {prompt}")).toBe(true);
  });

  it("does not match agent-farm", () => {
    expect(commandLooksLikeCursorAgentRun("agent-farm worker --command-template '{prompt}'")).toBe(false);
  });
});

describe("ensureCursorAgentStreamJson", () => {
  it("inserts --output-format stream-json after -p", () => {
    const out = ensureCursorAgentStreamJson("agent -p --force --trust {prompt}");
    expect(out).toContain("--output-format stream-json");
    expect(out).toMatch(/-p --output-format stream-json/);
  });

  it("does not double-insert stream-json", () => {
    const c = "agent -p --output-format stream-json --force {prompt}";
    const out = ensureCursorAgentStreamJson(c);
    expect(out.match(/--output-format stream-json/g)?.length).toBe(1);
  });

  it("leaves non-agent commands unchanged", () => {
    expect(ensureCursorAgentStreamJson("echo 1")).toBe("echo 1");
  });

  it("rewrites bare agent to absolute agent.cmd on win32", () => {
    if (process.platform !== "win32") return;
    const out = ensureCursorAgentStreamJson("agent -p --force {prompt}");
    expect(out).toMatch(/cursor-agent\/agent\.cmd/);
  });
});

describe("stripCursorAgentHealAppendix", () => {
  it("removes trailing [cursor-agent-heal] block", () => {
    const p = 'do work\n\n[cursor-agent-heal]\n{"hints":[]}';
    expect(stripCursorAgentHealAppendix(p)).toBe("do work");
  });
});

describe("createCursorAgentJsonStreamObserver", () => {
  it("collects trust errors into heal hints", () => {
    const o = createCursorAgentJsonStreamObserver();
    o.onStdoutLine(JSON.stringify({ type: "error", message: "workspace trust required" }));
    const h = o.healAppendixForRetry();
    expect(h).toContain("--trust");
    expect(o.snapshot().errorSnippets.length).toBeGreaterThan(0);
  });
});

describe("executor presets", () => {
  it("exposes codex and cursor-agent shell presets", () => {
    expect(EXECUTOR_PRESETS.codex).toMatch(/codex exec --json/);
    expect(EXECUTOR_PRESETS["cursor-agent"]).toMatch(/agent -p/);
    expect(EXECUTOR_ALIASES.agent).toBe("cursor-agent");
  });
});
