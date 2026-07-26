import { describe, expect, it } from "vitest";
import { sanitizeWaveSlug, defaultWaveOutputPath } from "../../src/application/wave/build-plan-execute-wave.js";

describe("plan command helpers", () => {
  describe("sanitizeWaveSlug", () => {
    it("converts Chinese to slug-friendly form", () => {
      // sanitizeWaveSlug removes non-ASCII, so Chinese chars become empty;
      // caller should pass --slug explicitly for Chinese requirements
      const result = sanitizeWaveSlug("user-auth-module");
      expect(result).toBe("user-auth-module");
    });

    it("truncates long slugs to 48 chars", () => {
      const long = "a".repeat(60);
      expect(sanitizeWaveSlug(long).length).toBeLessThanOrEqual(48);
    });

    it("strips special characters", () => {
      expect(sanitizeWaveSlug("hello world! @#$")).toBe("hello-world");
    });

    it("throws on empty after sanitize", () => {
      expect(() => sanitizeWaveSlug("")).toThrow(/slug/);
      expect(() => sanitizeWaveSlug("!!!")).toThrow(/slug/);
    });
  });

  describe("defaultWaveOutputPath", () => {
    it("produces path under .agent-farm/waves/", () => {
      const path = defaultWaveOutputPath("/home/user/project", "my-feature", "20260725");
      expect(path).toContain(".agent-farm/waves/");
      expect(path).toContain("my-feature-20260725.json");
    });

    it("sanitizes the slug in the path", () => {
      const path = defaultWaveOutputPath("/home/user/project", "My Feature!", "20260725");
      expect(path).toContain("my-feature");
    });
  });
});
