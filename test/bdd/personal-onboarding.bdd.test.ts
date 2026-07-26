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

function mkJsonlQueue(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const q = join(dir, ".agent-farm", "queue");
  mkdirSync(q, { recursive: true });
  return { dir, q };
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

  it("Given stale running 任务 When doctor --ci-exit Then 退出非 0 (auto-recovered, detected as heartbeat missing)", () => {
    const { q } = mkJsonlQueue("af-bdd-stale-");
    const stale = {
      task_id: "stale-1",
      dedupe_key: "stale-1",
      status: "running",
      prompt: "p",
      heartbeat_at: "2000-01-01T00:00:00.000Z",
    };
    writeFileSync(join(q, "tasks.jsonl"), `${JSON.stringify(stale)}\n`);
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(
      repoRoot,
      { AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
      [
        "doctor",
        "--ci-exit",
        "--lease-timeout-seconds",
        "60",
        "--task-file",
        join(q, "tasks.jsonl"),
        "--quarantine-file",
        join(q, "quarantine_tasks.jsonl"),
      ],
    );
    expect(r.status).not.toBe(0);
    // 自愈默认开启：stale running → auto-recovered → heartbeat 残留 detected
    expect(r.stderr).toMatch(/heartbeat|self.healing|recovered/i);
  });

  it("Given review 超期 When doctor --ci-exit Then 退出非 0", () => {
    const { q } = mkJsonlQueue("af-bdd-review-");
    const overdue = {
      task_id: "rev-1",
      dedupe_key: "rev-1",
      status: "review",
      prompt: "p",
      review_requested_at: "2000-01-01T00:00:00.000Z",
    };
    writeFileSync(join(q, "tasks.jsonl"), `${JSON.stringify(overdue)}\n`);
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" }, [
      "doctor",
      "--ci-exit",
      "--review-overdue-hours",
      "1",
      "--task-file",
      join(q, "tasks.jsonl"),
      "--quarantine-file",
      join(q, "quarantine_tasks.jsonl"),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/review|overdue/i);
  });

  it("Given heartbeat 无 claim When doctor --ci-exit Then 退出非 0", () => {
    const { q } = mkJsonlQueue("af-bdd-hb-");
    const hb = {
      task_id: "hb-1",
      dedupe_key: "hb-1",
      status: "queued",
      prompt: "p",
      heartbeat_at: "2026-01-01T00:00:00.000Z",
    };
    writeFileSync(join(q, "tasks.jsonl"), `${JSON.stringify(hb)}\n`);
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
    expect(r.stderr).toMatch(/heartbeat|claim/i);
  });

  it("Given demo 入队后 When queue list Then stdout 含 demo-onboarding", () => {
    const { q } = mkJsonlQueue("af-bdd-list-");
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const demo = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl" }, [
      "demo",
      "task",
      "--template",
      "noop",
      "--task-file",
      join(q, "tasks.jsonl"),
    ]);
    expect(demo.status).toBe(0);
    const list = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl" }, [
      "queue",
      "list",
      "--task-file",
      join(q, "tasks.jsonl"),
    ]);
    expect(list.status).toBe(0);
    expect(`${list.stdout}${list.stderr}`).toMatch(/demo-onboarding-/);
  });

  it("Given --template check When demo task Then 退出 0", () => {
    const { q } = mkJsonlQueue("af-bdd-demo-check-");
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl" }, [
      "demo",
      "task",
      "--template",
      "check",
      "--task-file",
      join(q, "tasks.jsonl"),
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/demo-onboarding-/);
  });
});
