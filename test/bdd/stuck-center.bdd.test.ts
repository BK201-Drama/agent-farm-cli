import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const tsx = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = join(repoRoot, "src/interfaces/cli/index.ts");

function runCli(cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync(process.execPath, [tsx, cliEntry, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("BDD: stuck center", () => {
  it("Given 空队列 When stuck list Then items 为空", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-stuck-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" }, [
      "stuck",
      "list",
      "--task-file",
      join(q, "tasks.jsonl"),
      "--quarantine-file",
      join(q, "quarantine_tasks.jsonl"),
    ]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.items).toEqual([]);
  });

  it("Given failed 任务 When stuck retry Then 变为 retry", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-stuck-retry-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    const task = {
      task_id: "stuck-retry-1",
      dedupe_key: "k1",
      prompt: "p",
      status: "failed",
      attempt: 1,
      created_at: "2026-05-16T00:00:00.000Z",
    };
    writeFileSync(join(q, "tasks.jsonl"), `${JSON.stringify(task)}\n`);
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl" }, [
      "stuck",
      "retry",
      "--task-id",
      "stuck-retry-1",
      "--task-file",
      join(q, "tasks.jsonl"),
    ]);
    expect(r.status).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body.ok).toBe(true);
    const line = readFileSync(join(q, "tasks.jsonl"), "utf8").trim();
    const saved = JSON.parse(line) as { status: string; attempt: number };
    expect(saved.status).toBe("retry");
    expect(saved.attempt).toBe(2);
  });
});
