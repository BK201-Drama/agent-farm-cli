import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

/**
 * BDD: 个人本机「第一次」路径
 */
describe("BDD: personal onboarding", () => {
  it("Given 空 jsonl 队列 When doctor --ci-exit Then 退出 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-personal-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" }, [
      "doctor",
      "--ci-exit",
      "--task-file",
      join(q, "tasks.jsonl"),
      "--quarantine-file",
      join(q, "quarantine_tasks.jsonl"),
    ]);
    expect(r.status).toBe(0);
  });

  it("Given 空队列 When demo task noop Then 返回 ok 且 id 含 demo-onboarding", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-demo-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl" }, [
      "demo",
      "task",
      "--template",
      "noop",
      "--task-file",
      join(q, "tasks.jsonl"),
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/demo-onboarding-/);
  });

  it("Given --brief 与 --ci-exit 同时 When doctor Then 进程失败（互斥）", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-mutex-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" }, [
      "doctor",
      "--brief",
      "--ci-exit",
      "--task-file",
      join(q, "tasks.jsonl"),
      "--quarantine-file",
      join(q, "quarantine_tasks.jsonl"),
    ]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/ci-exit|brief/i);
  });

  it("Given 重复 dedupe_key When doctor --ci-exit Then 退出非 0 且 stderr 含原因", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-unhealthy-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    const line = (id: string, dedupe: string) =>
      `${JSON.stringify({ task_id: id, dedupe_key: dedupe, status: "queued", prompt: "p" })}\n`;
    writeFileSync(join(q, "tasks.jsonl"), line("t1", "dup-key") + line("t2", "dup-key"));
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" }, [
      "doctor",
      "--ci-exit",
      "--task-file",
      join(q, "tasks.jsonl"),
      "--quarantine-file",
      join(q, "quarantine_tasks.jsonl"),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/doctor --ci-exit|dedupe/i);
  });
});
