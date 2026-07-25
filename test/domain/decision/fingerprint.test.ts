import { describe, expect, it } from "vitest";
import {
  fingerprintContext,
  fingerprintSimilarity,
  fingerprintToString,
  fingerprintFromString,
} from "../../../src/domain/decision/fingerprint.js";

describe("fingerprintContext", () => {
  it("produces sorted lowercase tokens without stop words", () => {
    const tokens = fingerprintContext(
      "Need to choose a database for persisting user data in the browser",
      ["IndexedDB", "SQLite", "localStorage"],
    );
    // tokens should be sorted, no stop words like "the", "a", "for", "to"
    expect(tokens).toEqual(tokens.slice().sort());
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("for");
    expect(tokens).not.toContain("to");
    expect(tokens).not.toContain("the");
  });

  it("returns deterministic output for same input", () => {
    const a = fingerprintContext("choose database", ["SQLite", "Postgres"]);
    const b = fingerprintContext("choose database", ["SQLite", "Postgres"]);
    expect(a).toEqual(b);
  });

  it("strips punctuation", () => {
    const tokens = fingerprintContext(
      "Should I use React.js? Or maybe Vue?",
      ["React", "Vue"],
    );
    expect(tokens).toContain("react");
    expect(tokens).toContain("vue");
    // "js" is only 2 chars, should be filtered
    expect(tokens).not.toContain("js");
  });

  it("filters tokens shorter than 3 characters", () => {
    const tokens = fingerprintContext("a b ab abc abcd", ["xy", "xyz"]);
    expect(tokens).toContain("abc");
    expect(tokens).toContain("abcd");
    expect(tokens).toContain("xyz");
    expect(tokens).not.toContain("ab");
    expect(tokens).not.toContain("xy");
  });
});

describe("fingerprintSimilarity", () => {
  it("returns 1 for identical token sets", () => {
    const a = ["database", "persist", "sqlite", "storage"];
    const b = ["database", "persist", "sqlite", "storage"];
    expect(fingerprintSimilarity(a, b)).toBe(1);
  });

  it("returns 0 for completely disjoint token sets", () => {
    const a = ["react", "frontend", "component"];
    const b = ["database", "sqlite", "backend"];
    expect(fingerprintSimilarity(a, b)).toBe(0);
  });

  it("returns ~0.5 for half overlap", () => {
    const a = ["database", "sqlite", "storage"];
    const b = ["database", "sqlite", "other"];
    // intersection: database, sqlite (2) / union: database, sqlite, storage, other (4) = 0.5
    expect(fingerprintSimilarity(a, b)).toBe(0.5);
  });

  it("returns 0 for empty sets", () => {
    expect(fingerprintSimilarity([], [])).toBe(0);
    expect(fingerprintSimilarity(["a"], [])).toBe(0);
    expect(fingerprintSimilarity([], ["a"])).toBe(0);
  });

  it("handles partial overlap", () => {
    const a = ["database", "sqlite", "indexeddb", "storage"];
    const b = ["database", "sqlite", "postgres", "orm"];
    // intersection: database, sqlite (2) / union: database, sqlite, indexeddb, storage, postgres, orm (6) = 0.333
    expect(fingerprintSimilarity(a, b)).toBeCloseTo(0.333, 2);
  });
});

describe("fingerprintToString / fingerprintFromString", () => {
  it("round-trips correctly", () => {
    const tokens = ["database", "persist", "sqlite", "storage"];
    const s = fingerprintToString(tokens);
    const restored = fingerprintFromString(s);
    expect(restored).toEqual(tokens);
  });
});
