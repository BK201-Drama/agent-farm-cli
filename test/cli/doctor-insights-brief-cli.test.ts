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

describe("doctor / insights --brief (CLI)", () => {
  it("doctor --brief with AGENT_FARM_STORAGE=jsonl does not claim sqlite: ok", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-doctor-jsonl-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    /** 在仓库根跑 CLI，避免 doctor 对临时目录做 opencode-ai npx 探测时长时间挂起 */
    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl" }, [
      "doctor",
      "--brief",
      "--task-file",
      join(q, "tasks.jsonl"),
      "--quarantine-file",
      join(q, "quarantine_tasks.jsonl"),
    ]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/sqlite:\s*ok/i);
    expect(r.stderr).toMatch(/queue storage:\s*jsonl/i);
  });

  it("insights --brief adds next-step hint when queue has no pipeline work", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-insights-brief-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), `${JSON.stringify({ task_id: "x", status: "done", prompt: "p" })}\n`);
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");

    const r = runCli(repoRoot, { AGENT_FARM_STORAGE: "jsonl" }, [
      "insights",
      "--brief",
      "--task-file",
      join(q, "tasks.jsonl"),
      "--event-file",
      join(q, "events.jsonl"),
    ]);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/next:/i);
    expect(r.stderr).toMatch(/queue list/i);
  });
});
