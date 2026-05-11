import { describe, expect, it } from "vitest";
import {
  parseAiReviewVerdict,
  stripVerdictLine,
} from "../../src/application/worker/ai-review-verdict.js";

describe("parseAiReviewVerdict", () => {
  it("returns none for empty output", () => {
    expect(parseAiReviewVerdict("")).toEqual({ kind: "none" });
  });

  it("returns none for whitespace-only output", () => {
    expect(parseAiReviewVerdict("  \n  \t  ")).toEqual({ kind: "none" });
  });

  it("returns pass for verdict pass JSON", () => {
    expect(parseAiReviewVerdict('{"verdict":"pass"}')).toEqual({ kind: "pass" });
  });

  it("returns fail for verdict fail JSON", () => {
    expect(parseAiReviewVerdict('{"verdict":"fail"}')).toEqual({ kind: "fail", reason: undefined });
  });

  it("returns fail with reason for verdict fail JSON with reason", () => {
    expect(parseAiReviewVerdict('{"verdict":"fail","reason":"missing semicolons"}')).toEqual({
      kind: "fail",
      reason: "missing semicolons",
    });
  });

  it("returns none for non-JSON last line", () => {
    expect(parseAiReviewVerdict("just some text")).toEqual({ kind: "none" });
  });

  it("returns none for JSON without verdict field", () => {
    expect(parseAiReviewVerdict('{"status":"ok"}')).toEqual({ kind: "none" });
  });

  it("returns none for JSON with unknown verdict value", () => {
    expect(parseAiReviewVerdict('{"verdict":"maybe"}')).toEqual({ kind: "none" });
  });

  it("finds verdict on last non-empty line with preceding log lines", () => {
    const output = "line1\nline2\n\n{\"verdict\":\"pass\"}";
    expect(parseAiReviewVerdict(output)).toEqual({ kind: "pass" });
  });

  it("finds verdict on last line with trailing whitespace", () => {
    const output = "stuff\n{\"verdict\":\"fail\",\"reason\":\"bad\"}  \n ";
    expect(parseAiReviewVerdict(output)).toEqual({
      kind: "fail",
      reason: "bad",
    });
  });

  it("handles PASS uppercase", () => {
    expect(parseAiReviewVerdict('{"verdict":"PASS"}')).toEqual({ kind: "pass" });
  });

  it("handles FAIL uppercase", () => {
    expect(parseAiReviewVerdict('{"verdict":"FAIL"}')).toEqual({ kind: "fail", reason: undefined });
  });

  it("returns none for JSON array last line", () => {
    expect(parseAiReviewVerdict('{"verdict":"pass"}\n[]')).toEqual({ kind: "none" });
  });

  it("returns none for JSON null last line", () => {
    expect(parseAiReviewVerdict("null")).toEqual({ kind: "none" });
  });

  it("returns none for malformed JSON last line", () => {
    expect(parseAiReviewVerdict("some\n{broken json}")).toEqual({ kind: "none" });
  });

  it("ignores empty trailing lines after verdict", () => {
    const output = '{\n  "verdict": "pass"\n}\n\n{"verdict":"pass"}\n\n';
    expect(parseAiReviewVerdict(output)).toEqual({ kind: "pass" });
  });

  it("ignores spaces around verdict value", () => {
    expect(parseAiReviewVerdict('{"verdict":"  pass  "}')).toEqual({ kind: "pass" });
  });

  it("returns none for empty reason on fail", () => {
    expect(parseAiReviewVerdict('{"verdict":"fail","reason":""}')).toEqual({
      kind: "fail",
      reason: undefined,
    });
  });

  it("returns fail with multi-word reason", () => {
    expect(
      parseAiReviewVerdict('{"verdict":"fail","reason":"missing semicolons; also bad formatting"}')
    ).toEqual({
      kind: "fail",
      reason: "missing semicolons; also bad formatting",
    });
  });
});

describe("stripVerdictLine", () => {
  it("removes single verdict json line", () => {
    expect(stripVerdictLine('{"verdict":"pass"}')).toBe("");
  });

  it("removes verdict line after preceding content", () => {
    expect(stripVerdictLine("log output\n{\"verdict\":\"fail\"}")).toBe("log output");
  });

  it("keeps output when no verdict", () => {
    expect(stripVerdictLine("some output")).toBe("some output");
  });

  it("keeps output when last line is not a verdict JSON", () => {
    expect(stripVerdictLine("output\njust text")).toBe("output\njust text");
  });

  it("handles trailing whitespace on verdict line", () => {
    expect(stripVerdictLine("before\n{\"verdict\":\"pass\"}  ")).toBe("before");
  });

  it("returns original for empty input", () => {
    expect(stripVerdictLine("")).toBe("");
  });
});
