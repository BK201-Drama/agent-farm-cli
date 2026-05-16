import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getFreePort } from "../helpers/free-port.js";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const tsx = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = join(repoRoot, "src/interfaces/cli/index.ts");

function prepareEmptyJsonlQueue(dir: string): void {
  const q = join(dir, ".agent-farm", "queue");
  mkdirSync(q, { recursive: true });
  writeFileSync(join(q, "tasks.jsonl"), "");
  writeFileSync(join(q, "events.jsonl"), "");
  writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
}

function spawnControlPlane(cwd: string, port: number) {
  return spawn(process.execPath, [tsx, cliEntry, "control-plane", "serve", "--port", String(port)], {
    cwd,
    env: {
      ...process.env,
      AGENT_FARM_STORAGE: "jsonl",
      AGENT_FARM_SKIP_OPENCODE_PROBE: "1",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function waitForHttpOk(url: string, attempts = 20, delayMs = 300): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error(`HTTP not ready: ${url}`);
}

describe("BDD: control-plane serve", () => {
  it("Given 空 jsonl 队列 When GET /api/view Then ok", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-cp-"));
    prepareEmptyJsonlQueue(dir);
    const port = await getFreePort();
    const child = spawnControlPlane(dir, port);

    try {
      const res = await waitForHttpOk(`http://127.0.0.1:${port}/api/view`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        stuck: { items: unknown[] };
        health: { service: string; queue_cwd: string };
      };
      expect(body.ok).toBe(true);
      expect(body.stuck.items).toEqual([]);
      expect(body.health.service).toBe("agent-farm-control-plane");
      expect(body.health.queue_cwd.replace(/\\/g, "/")).toContain(dir.replace(/\\/g, "/"));
    } finally {
      child.kill("SIGTERM");
    }
  }, 15000);

  it("Given 空 jsonl 队列 When POST /api/dispatch Then 入队成功", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-cp-"));
    prepareEmptyJsonlQueue(dir);
    const port = await getFreePort();
    const child = spawnControlPlane(dir, port);

    try {
      await waitForHttpOk(`http://127.0.0.1:${port}/api/view`);

      const dispatchRes = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "冒烟测试任务" }),
      });
      expect(dispatchRes.status).toBe(200);
      const dispatchBody = (await dispatchRes.json()) as { ok: boolean; task: { task_id: string; prompt: string } };
      expect(dispatchBody.ok).toBe(true);
      expect(dispatchBody.task.task_id).toBeTruthy();
      expect(dispatchBody.task.prompt).toMatch(/冒烟测试任务/);

      const viewRes = await fetch(`http://127.0.0.1:${port}/api/view`);
      const viewBody = (await viewRes.json()) as { board: { pipeline: unknown[] }; status: { tasks_total: number } };
      expect(viewBody.board.pipeline.length).toBeGreaterThanOrEqual(1);
      expect(viewBody.status.tasks_total).toBeGreaterThanOrEqual(1);
    } finally {
      child.kill("SIGTERM");
    }
  }, 15000);

  it("Given 空队列 When POST /api/stuck/recover Then ok", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-cp-rec-"));
    prepareEmptyJsonlQueue(dir);
    const port = await getFreePort();
    const child = spawnControlPlane(dir, port);

    try {
      await waitForHttpOk(`http://127.0.0.1:${port}/api/view`);

      const res = await fetch(`http://127.0.0.1:${port}/api/stuck/recover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; recovered_count: number };
      expect(body.ok).toBe(true);
      expect(body.recovered_count).toBe(0);
    } finally {
      child.kill("SIGTERM");
    }
  }, 15000);

  it("Given 空队列 When GET /api/health Then service identity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-cp-h-"));
    prepareEmptyJsonlQueue(dir);
    const port = await getFreePort();
    const child = spawnControlPlane(dir, port);

    try {
      const res = await waitForHttpOk(`http://127.0.0.1:${port}/api/health`);
      const body = (await res.json()) as { service: string; queue_cwd: string };
      expect(body.service).toBe("agent-farm-control-plane");
      expect(body.queue_cwd.replace(/\\/g, "/")).toContain(dir.replace(/\\/g, "/"));
    } finally {
      child.kill("SIGTERM");
    }
  }, 15000);
});
