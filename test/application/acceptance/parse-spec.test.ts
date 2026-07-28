import { describe, expect, it } from "vitest";
import { parseAcceptanceSpecJson } from "../../../src/application/acceptance/parse-spec.js";
import type { AcceptanceSpec } from "../../../src/application/acceptance/types.js";

function validSpec(overrides?: Partial<AcceptanceSpec>): AcceptanceSpec {
  return {
    poc_id: "test-poc",
    code_root: "./test-poc",
    demo: {
      id: "smoke",
      how: "Run the smoke test",
      verify: "node -e \"process.exit(0)\"",
    },
    items: [
      {
        id: "ac-1",
        title: "First check",
        verify: "npm test",
        needs_human: false,
        depends_on: [],
      },
    ],
    ...overrides,
  };
}

describe("parseAcceptanceSpecJson", () => {
  // ── 最小合法 spec ──────────────────────────────────────────────

  it("parses a minimal valid spec", () => {
    const spec = validSpec();
    const result = parseAcceptanceSpecJson(spec);
    expect(result.poc_id).toBe("test-poc");
    expect(result.code_root).toBe("./test-poc");
    expect(result.demo.id).toBe("smoke");
    expect(result.demo.verify).toBe('node -e "process.exit(0)"');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("ac-1");
    expect(result.items[0].needs_human).toBe(false);
    expect(result.items[0].depends_on).toEqual([]);
  });

  it("defaults needs_human to false when missing", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      demo: { id: "d", verify: "true" },
      items: [{ id: "i1", title: "t", verify: "true" }],
    };
    const result = parseAcceptanceSpecJson(raw);
    expect(result.items[0].needs_human).toBe(false);
  });

  it("defaults depends_on to [] when missing", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      demo: { id: "d", verify: "true" },
      items: [{ id: "i1", title: "t", verify: "true" }],
    };
    const result = parseAcceptanceSpecJson(raw);
    expect(result.items[0].depends_on).toEqual([]);
  });

  // ── needs_human / verify 交叉校验 ──────────────────────────────

  it("allows verify null when needs_human is true", () => {
    const spec = validSpec({
      items: [
        { id: "human-ac", title: "Needs human judgment", verify: null, needs_human: true, depends_on: [] },
      ],
    });
    const result = parseAcceptanceSpecJson(spec);
    expect(result.items[0].verify).toBeNull();
    expect(result.items[0].needs_human).toBe(true);
  });

  it("rejects verify null when needs_human is false", () => {
    const spec = validSpec({
      items: [
        { id: "bad", title: "Machine check", verify: null, needs_human: false, depends_on: [] },
      ],
    });
    expect(() => parseAcceptanceSpecJson(spec)).toThrow(/verify must be a non-empty string/);
  });

  it("rejects verify null when needs_human is missing (defaults false)", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      demo: { id: "d", verify: "true" },
      items: [{ id: "bad", title: "No needs_human", verify: null }],
    };
    expect(() => parseAcceptanceSpecJson(raw)).toThrow(/verify must be a non-empty string/);
  });

  it("rejects verify empty string when needs_human is false", () => {
    const spec = validSpec({
      items: [
        { id: "bad", title: "Empty verify", verify: "", needs_human: false, depends_on: [] },
      ],
    });
    expect(() => parseAcceptanceSpecJson(spec)).toThrow(/verify must be a non-empty string/);
  });

  // ── depends_on 交叉引用校验 ────────────────────────────────────

  it("accepts valid depends_on referencing existing items", () => {
    const spec = validSpec({
      items: [
        { id: "ac-1", title: "First", verify: "cmd1", needs_human: false, depends_on: [] },
        { id: "ac-2", title: "Second", verify: "cmd2", needs_human: false, depends_on: ["ac-1"] },
      ],
    });
    const result = parseAcceptanceSpecJson(spec);
    expect(result.items).toHaveLength(2);
    expect(result.items[1].depends_on).toEqual(["ac-1"]);
  });

  it("rejects depends_on referencing unknown id", () => {
    const spec = validSpec({
      items: [
        { id: "ac-1", title: "Only item", verify: "cmd1", needs_human: false, depends_on: ["ac-missing"] },
      ],
    });
    expect(() => parseAcceptanceSpecJson(spec)).toThrow(
      /depends_on id must reference an existing item id/,
    );
  });

  it("rejects depends_on referencing id in a different item that does not exist", () => {
    const spec = validSpec({
      items: [
        { id: "ac-1", title: "First", verify: "cmd1", needs_human: false, depends_on: [] },
        { id: "ac-2", title: "Second", verify: "cmd2", needs_human: false, depends_on: ["ac-3"] },
      ],
    });
    expect(() => parseAcceptanceSpecJson(spec)).toThrow(
      /depends_on id must reference an existing item id/,
    );
  });

  // ── 结构校验 ──────────────────────────────────────────────────

  it("rejects missing demo", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      items: [{ id: "i1", title: "t", verify: "true" }],
    };
    expect(() => parseAcceptanceSpecJson(raw)).toThrow();
  });

  it("rejects empty items array", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      demo: { id: "d", verify: "true" },
      items: [],
    };
    expect(() => parseAcceptanceSpecJson(raw)).toThrow();
  });

  it("rejects demo with empty verify", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      demo: { id: "d", verify: "" },
      items: [{ id: "i1", title: "t", verify: "true" }],
    };
    expect(() => parseAcceptanceSpecJson(raw)).toThrow();
  });

  it("rejects item with empty id", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      demo: { id: "d", verify: "true" },
      items: [{ id: "", title: "t", verify: "true" }],
    };
    expect(() => parseAcceptanceSpecJson(raw)).toThrow();
  });

  // ── demo how 可选 ──────────────────────────────────────────────

  it("allows demo without how field", () => {
    const raw = {
      poc_id: "p",
      code_root: ".",
      demo: { id: "d", verify: "true" },
      items: [{ id: "i1", title: "t", verify: "true" }],
    };
    const result = parseAcceptanceSpecJson(raw);
    expect(result.demo.how).toBeUndefined();
  });

  // ── 多 item 交叉依赖链 ────────────────────────────────────────

  it("accepts a chain of depends_on dependencies", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
        { id: "c", title: "C", verify: "cmd", needs_human: false, depends_on: ["b"] },
        { id: "d", title: "D", verify: "cmd", needs_human: false, depends_on: ["a", "c"] },
      ],
    });
    const result = parseAcceptanceSpecJson(spec);
    expect(result.items).toHaveLength(4);
  });
});
