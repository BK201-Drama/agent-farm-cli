import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const scriptPath = join(repoRoot, "scripts", "enqueue-task-wave.mjs");

function baseTask(taskId: string, dedupe?: string) {
  return {
    task_id: taskId,
    dedupe_key: dedupe ?? taskId,
    prompt: `仓库根 test。先 Read src/index.ts。执行任务 ${taskId}；每步后 git status。\n\n验收：npm test`,
    mode: "execute",
    acceptance_criteria: "npm test",
  };
}

function runWave(spawnArgs: string[], entries: Record<string, unknown>[]) {
  const tmp = resolve(mkdtempSync("test-enqueue-"));
  const p = join(tmp, "wave.json");
  writeFileSync(p, JSON.stringify(entries));
  try {
    // cwd 与 enqueue-task-wave 内 queue add 一致，SQLite 落在临时目录，不污染仓库 .agent-farm/queue
    const r = spawnSync(process.execPath, [scriptPath, p, ...spawnArgs], {
      encoding: "utf8",
      cwd: tmp,
    });
    return { stdout: r.stdout, stderr: r.stderr, status: r.status };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe("scripts/enqueue-task-wave.mjs in-wave dedupe", () => {
  it("no duplicates → no stderr about dupes (queue add may fail, that's fine)", () => {
    const entries = [
      baseTask("task-a"),
      baseTask("task-b"),
      baseTask("task-c"),
    ];
    const r = runWave([], entries);
    expect(r.stderr).not.toMatch(/同波重复/);
    expect(r.stderr).not.toMatch(/去重后/);
  });

  it("duplicate task_id → warn on stderr + skip, continue processing others", () => {
    const entries = [
      baseTask("dup-a"),
      baseTask("unique-b"),
      baseTask("dup-a"), // duplicate task_id
      baseTask("unique-c"),
    ];
    const r = runWave([], entries);
    expect(r.stderr).toMatch(/同波重复（跳过）：task_id=dup-a/);
    expect(r.stderr).toMatch(/去重后 3 条/);
    // unique-b and unique-c should still be enqueued
  });

  it("duplicate dedupe_key (different task_id) → warn on stderr + skip", () => {
    const entries = [
      { ...baseTask("task-x", "same-key") },
      baseTask("task-y"),
      { ...baseTask("task-z", "same-key") }, // different task_id, same dedupe_key
    ];
    const r = runWave([], entries);
    expect(r.stderr).toMatch(/同波重复（跳过）：dedupe_key=same-key/);
    expect(r.stderr).toMatch(/去重后 2 条/);
  });

  it("both task_id and dedupe_key duplicate → warn both reasons", () => {
    const entries = [
      baseTask("dup-all"),
      baseTask("dup-all"), // same task_id and dedupe_key
    ];
    const r = runWave([], entries);
    expect(r.stderr).toMatch(/同波重复（跳过）：task_id=dup-all，dedupe_key=dup-all/);
    expect(r.stderr).toMatch(/去重后 1 条/);
  });

  it("multiple different duplicates → warns for each, keeps first occurrence", () => {
    const entries = [
      baseTask("keep-1"),
      baseTask("keep-2"),
      baseTask("keep-1"), // dup of keep-1
      baseTask("keep-2"), // dup of keep-2
      baseTask("keep-3"),
      baseTask("keep-1"), // dup of keep-1 again
    ];
    const r = runWave([], entries);
    // Two distinct duplicates, 3 occurrences of duplication
    const dupLines = r.stderr.split("\n").filter((l) => l.includes("同波重复（跳过）"));
    expect(dupLines.length).toBe(3);
    expect(r.stderr).toMatch(/去重后 3 条/);
  });

  it("empty wave array → no duplicates, exits 2 (queue add fails) — no dedupe warnings", () => {
    const r = runWave([], []);
    expect(r.stderr).not.toMatch(/同波重复/);
  });

  it("single entry wave → no duplicates", () => {
    const entries = [baseTask("only-one")];
    const r = runWave([], entries);
    expect(r.stderr).not.toMatch(/同波重复/);
  });

  it("retains first occurrence, skips subsequent duplicates", () => {
    const entries = [
      {
        ...baseTask("first", "key-a"),
        prompt:
          "仓库根 test。先 Read src/a.ts。FIRST 任务；禁止长时间无 git diff；每步后 git status。\n\n验收：npm test",
      },
      {
        ...baseTask("second", "key-b"),
        prompt:
          "仓库根 test。先 Read src/b.ts。SECOND 任务；禁止长时间无 git diff；每步后 git status。\n\n验收：npm test",
      },
      {
        ...baseTask("first", "key-a"),
        prompt:
          "仓库根 test。先 Read src/c.ts。THIS SHOULD BE SKIPPED；每步后 git status。\n\n验收：npm test",
      },
    ];
    const r = runWave([], entries);
    // Verify stderr: duplicate warning for both task_id and dedupe_key
    expect(r.stderr).toMatch(/同波重复（跳过）：task_id=first，dedupe_key=key-a/);
    expect(r.stderr).toMatch(/去重后 2 条/);
  });
});
