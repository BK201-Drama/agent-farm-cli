import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const tsx = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = join(repoRoot, "src/interfaces/cli/index.ts");
const runE2e = process.env.AGENT_FARM_E2E === "1";
const describeE2e = runE2e ? describe : describe.skip;

function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [tsx, cliEntry, ...args], {
    cwd: repoRoot,
    env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1", ...env },
    encoding: "utf8",
  });
}

function mkQueue(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const q = join(dir, ".agent-farm", "queue");
  mkdirSync(q, { recursive: true });
  writeFileSync(join(q, "tasks.jsonl"), "");
  writeFileSync(join(q, "events.jsonl"), "");
  writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
  const tf = join(q, "tasks.jsonl");
  return { dir, tf };
}

/**
 * BDD: 全链路 worker（需 AGENT_FARM_E2E=1；默认 skip 以免拖慢 test:bdd）
 */
describeE2e("BDD: e2e worker pipeline (@slow, AGENT_FARM_E2E=1)", () => {
  // Given 已入队 execute 任务 When echo worker 消费 Then queue list 含 done
  it("Given echo worker When queue add Then task reaches done", () => {
    const { dir, tf } = mkQueue("af-e2e-");
    const env = { AGENT_FARM_STORAGE: "jsonl" };

    const add = runCli(
      [
        "queue",
        "add",
        "--task-json",
        JSON.stringify({
          task_id: "e2e-t1",
          dedupe_key: "e2e-t1",
          mode: "execute",
          prompt: "e2e pipeline smoke: echo the prompt in shared workspace; no file changes; exit 0.",
          acceptance_criteria: "worker exits 0 and task status becomes done",
        }),
        "--task-file",
        tf,
      ],
      env,
    );
    expect(add.status).toBe(0);

    const worker = runCli(
      [
        "worker",
        "--workspace",
        dir,
        "--workers",
        "1",
        "--drain-idle-loops",
        "2",
        "--command-template",
        "echo {prompt}",
        "--task-file",
        tf,
        "--shared-workspace",
      ],
      env,
    );
    expect(worker.status).toBe(0);

    const list = runCli(["queue", "list", "--status", "done", "--task-file", tf], env);
    expect(list.status).toBe(0);
    expect(`${list.stdout}${list.stderr}`).toMatch(/e2e-t1/);
  }, 90000);
});
