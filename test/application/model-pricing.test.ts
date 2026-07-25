import { describe, it, expect } from "vitest";
import { resolveModelPrice, computeCostCents, formatCostCents } from "../../src/application/executors/model-pricing.js";

describe("resolveModelPrice", () => {
  it("returns price for known model (exact match)", () => {
    const price = resolveModelPrice("claude-opus-4-8");
    expect(price.input).toBe(15);
    expect(price.output).toBe(75);
  });

  it("returns price for known model (prefix match)", () => {
    const price = resolveModelPrice("claude-sonnet-5-20251001");
    expect(price.input).toBe(3);
    expect(price.output).toBe(15);
  });

  it("returns zero price for unknown model", () => {
    const price = resolveModelPrice("unknown-model-v1");
    expect(price.input).toBe(0);
    expect(price.output).toBe(0);
  });

  it("handles empty string", () => {
    const price = resolveModelPrice("");
    expect(price.input).toBe(0);
    expect(price.output).toBe(0);
  });

  it("returns gpt-4o-mini price", () => {
    const price = resolveModelPrice("gpt-4o-mini");
    expect(price.input).toBe(0.15);
    expect(price.output).toBe(0.6);
  });

  it("returns deepseek price", () => {
    const price = resolveModelPrice("deepseek-v3");
    expect(price.input).toBe(0.27);
    expect(price.output).toBe(1.1);
  });
});

describe("computeCostCents", () => {
  it("computes cost in cents for small token count", () => {
    // 1000 input + 500 output at $15/$75 per 1M
    // cost = (1000/1M)*15 + (500/1M)*75 = 0.015 + 0.0375 = $0.0525 → 5 cents
    const cents = computeCostCents(1000, 500, { input: 15, output: 75 });
    expect(cents).toBe(5);
  });

  it("handles zero tokens", () => {
    const cents = computeCostCents(0, 0, { input: 15, output: 75 });
    expect(cents).toBe(0);
  });

  it("handles large token counts", () => {
    // 1M input + 1M output at $15/$75
    const cents = computeCostCents(1_000_000, 1_000_000, { input: 15, output: 75 });
    expect(cents).toBe(9000); // $90.00
  });

  it("rounds to nearest cent", () => {
    // 100 input + 100 output at $1/$1 per 1M
    // cost = (100/1M)*1 + (100/1M)*1 = 0.0002 → 0 cents (rounds down)
    const cents = computeCostCents(100, 100, { input: 1, output: 1 });
    expect(cents).toBe(0);
  });
});

describe("formatCostCents", () => {
  it("formats zero", () => {
    expect(formatCostCents(0)).toBe("<$0.01");
  });

  it("formats small amount (< $10)", () => {
    expect(formatCostCents(42)).toBe("$0.420");
  });

  it("formats medium amount (< $10)", () => {
    expect(formatCostCents(523)).toBe("$5.230");
  });

  it("formats large amount (≥ $10)", () => {
    expect(formatCostCents(9000)).toBe("$90.00");
  });

  it("formats exact $10 boundary", () => {
    expect(formatCostCents(1000)).toBe("$10.00");
  });
});
