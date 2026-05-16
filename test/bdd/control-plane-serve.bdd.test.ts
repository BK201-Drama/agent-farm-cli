import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const tsx = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = join(repoRoot, "src/interfaces/cli/index.ts");

describe("BDD: control-plane serve", () => {
  it("Given 空 jsonl 队列 When GET /api/view Then ok", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-cp-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    const port = 18766;
    const child = spawn(
      process.execPath,
      [tsx, cliEntry, "control-plane", "serve", "--port", String(port)],
      {
        cwd: dir,
        env: {
          ...process.env,
          AGENT_FARM_STORAGE: "jsonl",
          AGENT_FARM_SKIP_OPENCODE_PROBE: "1",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    let res: Response | undefined;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        res = await fetch(`http://127.0.0.1:${port}/api/view`);
        if (res.ok) break;
      } catch {
        /* retry */
      }
    }
    try {
      if (!res) throw new Error("control-plane serve did not become ready");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        stuck: { items: unknown[] };
        health: { service: string; queue_cwd: string };
      };
      expect(body.ok).toBe(true);
      expect(body.stuck.items).toEqual([]);
      expect(body.health.service).toBe("agent-farm-control-plane");
      expect(body.health.queue_cwd).toBeTruthy();
    } finally {
      child.kill("SIGTERM");
    }
  }, 15000);

  it("Given 空 jsonl 队列 When POST /api/dispatch Then 入队成功", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-cp-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    const port = 18767;
    const child = spawn(
      process.execPath,
      [tsx, cliEntry, "control-plane", "serve", "--port", String(port)],
      {
        cwd: dir,
        env: {
          ...process.env,
          AGENT_FARM_STORAGE: "jsonl",
          AGENT_FARM_SKIP_OPENCODE_PROBE: "1",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/view`);
        if (r.ok) { ready = true; break; }
      } catch { /* retry */ }
    }
    try {
      if (!ready) throw new Error("control-plane serve did not become ready");

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
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    const port = 18768;
    const child = spawn(
      process.execPath,
      [tsx, cliEntry, "control-plane", "serve", "--port", String(port)],
      {
        cwd: dir,
        env: {
          ...process.env,
          AGENT_FARM_STORAGE: "jsonl",
          AGENT_FARM_SKIP_OPENCODE_PROBE: "1",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    try {
      let ready = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 300));
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/view`);
          if (r.ok) {
            ready = true;
            break;
          }
        } catch {
          /* retry */
        }
      }
      if (!ready) throw new Error("control-plane serve did not become ready");

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
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    const port = 18769;
    const child = spawn(
      process.execPath,
      [tsx, cliEntry, "control-plane", "serve", "--port", String(port)],
      {
        cwd: dir,
        env: { ...process.env, AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    try {
      let ready = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 300));
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/health`);
          if (r.ok) {
            ready = true;
            const body = (await r.json()) as { service: string; queue_cwd: string };
            expect(body.service).toBe("agent-farm-control-plane");
            expect(body.queue_cwd.replace(/\\/g, "/")).toContain("/.agent-farm");
            break;
          }
        } catch {
          /* retry */
        }
      }
      if (!ready) throw new Error("health endpoint not ready");
    } finally {
      child.kill("SIGTERM");
    }
  }, 15000);
});
