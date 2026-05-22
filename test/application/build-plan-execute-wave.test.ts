import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPlanExecuteWave,
  defaultWaveOutputPath,
  sanitizeWaveSlug,
} from "../../src/application/wave/build-plan-execute-wave.js";
import { validateWaveArray } from "../../src/application/wave/wave-validate.js";

describe("buildPlanExecuteWave", () => {
  it("builds plan+execute items that pass validateWaveArray", () => {
    const items = buildPlanExecuteWave({
      slug: "auth-login",
      goal: "实现登录 API",
      dateStamp: "20260522",
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.mode).toBe("plan");
    expect(items[1]?.mode).toBe("execute");
    expect(String(items[1]?.acceptance_criteria ?? "")).toContain("npm run check");
    const warnings = validateWaveArray(items, "test-wave.json");
    expect(warnings).toEqual([]);
  });

  it("sanitizes slug for task_id prefix", () => {
    const items = buildPlanExecuteWave({
      slug: "  Feature X!! ",
      goal: "demo",
      dateStamp: "20260101",
    });
    expect(String(items[0]?.task_id)).toMatch(/^feature-x-20260101-plan$/);
  });
});

describe("sanitizeWaveSlug", () => {
  it("rejects empty after sanitize", () => {
    expect(() => sanitizeWaveSlug("!!!")).toThrow(/slug/);
  });
});

describe("defaultWaveOutputPath", () => {
  it("places file under .agent-farm/waves", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-wave-"));
    try {
      const p = defaultWaveOutputPath(dir, "my-feature", "20260522");
      expect(p).toContain(".agent-farm/waves/my-feature-20260522.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("wave new integration (dist CLI)", () => {
  it("writes valid wave via wave new --print", async () => {
    const { spawnSync } = await import("node:child_process");
    const { existsSync } = await import("node:fs");
    const { getRepoRoot } = await import("../helpers/repo-root.js");
    const root = getRepoRoot(import.meta.url);
    const cli = join(root, "dist", "interfaces", "cli", "index.js");
    if (!existsSync(cli)) {
      return;
    }
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "wave",
        "new",
        "--slug",
        "cli-smoke",
        "--goal",
        "smoke test wave new",
        "--print",
        "--no-interactive",
        "--acceptance-execute",
        "npm run check",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    const items = JSON.parse(r.stdout) as unknown[];
    expect(Array.isArray(items)).toBe(true);
    validateWaveArray(items, "cli-smoke.json");
  });
});
