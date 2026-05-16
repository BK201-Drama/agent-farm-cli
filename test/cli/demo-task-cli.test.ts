import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const cliEntry = join(repoRoot, "src/interfaces/cli/index.ts");

function runCli(cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync(process.execPath, [join(repoRoot, "node_modules/tsx/dist/cli.mjs"), cliEntry, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("demo task CLI", () => {
  it("enqueues noop demo with demo- dedupe prefix", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-demo-task-"));
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
    expect(r.stdout).toMatch(/"ok"\s*:\s*true/);
  });
});
