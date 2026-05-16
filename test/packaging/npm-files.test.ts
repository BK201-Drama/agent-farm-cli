import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

describe("npm package files", () => {
  it("includes examples/ for published team handoff wave", () => {
    const pkg = JSON.parse(readFileSync(join(getRepoRoot(import.meta.url), "package.json"), "utf8")) as {
      files?: string[];
    };
    expect(pkg.files).toContain("examples");
  });
});
