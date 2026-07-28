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
    env: { ...process.env, ...env, AGENT_FARM_STORAGE: "jsonl" },
    encoding: "utf8",
  });
}

/**
 * BDD: Spec Acceptance Runtime — noop POC 端到端
 *
 * Given 独立 temp farmRoot + noop 验收规格
 * When 加载入队 → 标记 AC 任务 done → 查询状态 → 运行 demo
 * Then items pass, demo ready → demo pass → done true
 */
describe("BDD: acceptance noop", () => {
  it("Given noop-poc When load → mark AC done → status → run demo Then done=true", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-accept-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    const taskFile = join(q, "tasks.jsonl");
    writeFileSync(taskFile, "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    const pocId = `noop-bdd-${Date.now()}`;
    const itemId = "noop-ac";
    const dedupe = `acceptance__${pocId}__${itemId}`;
    const specPath = join(dir, "acceptance.json");
    writeFileSync(
      specPath,
      JSON.stringify(
        {
          poc_id: pocId,
          code_root: ".",
          demo: {
            id: "noop-demo",
            how: "exit 0",
            verify: 'node -e "process.exit(0)"',
          },
          items: [
            {
              id: itemId,
              title: "No-op machine acceptance check",
              verify: 'node -e "process.exit(0)"',
              needs_human: false,
              depends_on: [],
            },
          ],
        },
        null,
        2,
      ),
    );

    const env: NodeJS.ProcessEnv = {};

    const load = runCli(dir, env, ["acceptance", "load", "--spec", specPath, "--task-file", taskFile]);
    expect(load.status, load.stderr || load.stdout).toBe(0);
    const loadOut = JSON.parse(load.stdout);
    expect(loadOut.ok).toBe(true);
    expect(loadOut.poc_id).toBe(pocId);
    expect(loadOut.enqueued_count).toBe(1);

    const lines = readFileSync(taskFile, "utf-8").trim().split("\n");
    const updated = lines.map((line) => {
      const task = JSON.parse(line);
      if (task.dedupe_key === dedupe) {
        return JSON.stringify({ ...task, status: "done" });
      }
      return line;
    });
    writeFileSync(taskFile, updated.join("\n") + "\n");

    const status1 = runCli(dir, env, ["acceptance", "status", "--poc", pocId, "--task-file", taskFile]);
    expect(status1.status, status1.stderr || status1.stdout).toBe(0);
    const s1 = JSON.parse(status1.stdout);
    expect(s1.ok).toBe(true);
    expect(s1.poc_id).toBe(pocId);
    expect(s1.done).toBe(false);
    expect(s1.demo).toBe("ready");
    expect(s1.items[itemId]).toBe("pass");

    const demo = runCli(dir, env, ["acceptance", "demo", "--poc", pocId, "--task-file", taskFile]);
    expect(demo.status, demo.stderr || demo.stdout).toBe(0);
    const d = JSON.parse(demo.stdout);
    expect(d.ok).toBe(true);
    expect(d.passed).toBe(true);
    expect(d.demo).toBe("pass");

    const status2 = runCli(dir, env, ["acceptance", "status", "--poc", pocId, "--task-file", taskFile]);
    expect(status2.status).toBe(0);
    const s2 = JSON.parse(status2.stdout);
    expect(s2.ok).toBe(true);
    expect(s2.done).toBe(true);
    expect(s2.demo).toBe("pass");
  });
});
