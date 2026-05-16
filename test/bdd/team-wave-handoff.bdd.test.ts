import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const wavePath = join(repoRoot, "examples/waves/team-handoff-min.json");
const enqueueScript = join(repoRoot, "scripts/enqueue-task-wave.mjs");

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

  it("Given examples wave 路径 When enqueue-task-wave Then 解析通过（入队可因环境失败）", () => {
    const tmp = resolve(mkdtempSync(join(tmpdir(), "af-bdd-enqueue-")));
    const q = join(tmp, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    try {
      const r = spawnSync(process.execPath, [enqueueScript, wavePath], {
        cwd: tmp,
        encoding: "utf8",
        env: { ...process.env, AGENT_FARM_STORAGE: "jsonl" },
      });
      expect(`${r.stderr}${r.stdout}`).not.toMatch(/无法解析|须为数组|第 \d+ 项/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
