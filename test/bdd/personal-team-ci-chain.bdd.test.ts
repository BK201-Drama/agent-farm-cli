import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const tsx = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = join(repoRoot, "src/interfaces/cli/index.ts");

function runCli(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [tsx, cliEntry, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

/**
 * BDD: 个人→团队→CI 最小链（单会话内顺序执行，无 worker）
 */
describe("BDD: personal → team → CI chain", () => {
  it("Given 空队列 When demo → doctor --ci-exit → npm run ci:health:local Then 均成功", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-bdd-chain-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    const demo = runCli(
      ["demo", "task", "--template", "noop", "--task-file", join(q, "tasks.jsonl")],
      { AGENT_FARM_STORAGE: "jsonl" },
    );
    expect(demo.status).toBe(0);

    const doctor = runCli(
      [
        "doctor",
        "--ci-exit",
        "--task-file",
        join(q, "tasks.jsonl"),
        "--quarantine-file",
        join(q, "quarantine_tasks.jsonl"),
      ],
      { AGENT_FARM_STORAGE: "jsonl", AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
    );
    expect(doctor.status).toBe(0);

    const local = spawnSync(process.execPath, ["scripts/ci-health-local.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
    });
    expect(local.status).toBe(0);
    expect(local.stdout).toMatch(/ci-health-local:\s*ok/i);
  });
});
