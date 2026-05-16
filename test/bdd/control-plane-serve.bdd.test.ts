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
      const body = (await res.json()) as { ok: boolean; stuck: { items: unknown[] } };
      expect(body.ok).toBe(true);
      expect(body.stuck.items).toEqual([]);
    } finally {
      child.kill("SIGTERM");
    }
  }, 15000);
});
