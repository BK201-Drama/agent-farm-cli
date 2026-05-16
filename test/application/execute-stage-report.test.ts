import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeExecuteStageReport } from "../../src/application/worker/execute-stage-report.js";

describe("writeExecuteStageReport", () => {
  it("writes schema_version 1 json under runs/<taskId>/", () => {
    const runs = mkdtempSync(join(tmpdir(), "af-exec-report-"));
    const path = writeExecuteStageReport(runs, "task-a", 0, "2026-05-16T00:00:00Z", 0, "hello");
    const body = JSON.parse(readFileSync(path, "utf8")) as { schema_version: number; exit_code: number };
    expect(body.schema_version).toBe(1);
    expect(body.exit_code).toBe(0);
    expect(path).toContain("execute-0.json");
  });
});
