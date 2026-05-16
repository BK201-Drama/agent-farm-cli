import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const wavePath = join(repoRoot, "examples/waves/team-handoff-min.json");

/**
 * BDD: 团队异步交接的最小 wave 可被文档引用且字段合法
 *
 * Given 仓库内官方示例 `examples/waves/team-handoff-min.json`
 * When 解析为任务数组
 * Then 每项含 task_id / dedupe_key / prompt；且含 plan 与 execute；execute 的 prompt 含验收命令
 */
describe("BDD: team wave handoff (official minimal wave)", () => {
  it("meets handoff wave contract (plan then execute, acceptance in prompt)", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThanOrEqual(2);

    for (const t of raw) {
      expect(t && typeof t === "object").toBe(true);
      const o = t as Record<string, unknown>;
      expect(String(o.task_id ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.dedupe_key ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.prompt ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.task_id)).toBe(String(o.dedupe_key));
    }

    const modes = raw.map((t) => String((t as { mode?: string }).mode ?? ""));
    expect(modes.some((m) => m === "plan")).toBe(true);
    expect(modes.some((m) => m === "execute")).toBe(true);

    const execute = raw.find((t) => (t as { mode?: string }).mode === "execute") as
      | { prompt?: string; acceptance_criteria?: string }
      | undefined;
    expect(execute).toBeDefined();
    expect(String(execute?.prompt ?? "")).toMatch(/验收：/);
    expect(String(execute?.prompt ?? "")).toMatch(/npm run check/);
    expect(String(execute?.prompt ?? "")).toMatch(/npm test/);
    expect(String(execute?.acceptance_criteria ?? "").length).toBeGreaterThan(0);
  });
});
