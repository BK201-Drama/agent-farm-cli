import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writePrettyJsonReportIfPath } from "../../src/interfaces/cli/print.js";

describe("writePrettyJsonReportIfPath", () => {
  it("no-ops when path is empty", async () => {
    await writePrettyJsonReportIfPath("", { a: 1 });
    await writePrettyJsonReportIfPath(undefined, { a: 1 });
  });

  it("writes pretty JSON with trailing newline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-print-json-"));
    const p = join(dir, "out.json");
    await writePrettyJsonReportIfPath(p, { b: [2] });
    try {
      expect(readFileSync(p, "utf8")).toBe(`${JSON.stringify({ b: [2] }, null, 2)}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
