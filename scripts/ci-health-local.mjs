#!/usr/bin/env node
/**
 * 本地复现「CI 健康巡检」最小两步：doctor --ci-exit + insights（jsonl 临时队列）。
 * 与 `.github/workflows/agent-farm-health-cron.yml` 精神对齐；不修改领域层。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const tsx = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = join(repoRoot, "src/interfaces/cli/index.ts");

function runCli(args, extraEnv) {
  const r = spawnSync(process.execPath, [tsx, cliEntry, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  });
  if (r.status !== 0) {
    process.stderr.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    process.exit(r.status ?? 1);
  }
}

const tmp = mkdtempSync(join(tmpdir(), "af-ci-health-"));
const q = join(tmp, ".agent-farm", "queue");
mkdirSync(q, { recursive: true });
const taskFile = join(q, "tasks.jsonl");
const eventFile = join(q, "events.jsonl");
const quarantineFile = join(q, "quarantine_tasks.jsonl");
writeFileSync(taskFile, "", "utf8");
writeFileSync(eventFile, "", "utf8");
writeFileSync(quarantineFile, "", "utf8");

const baseEnv = {
  AGENT_FARM_STORAGE: "jsonl",
  AGENT_FARM_SKIP_OPENCODE_PROBE: "1",
};

try {
  runCli(
    ["doctor", "--ci-exit", "--task-file", taskFile, "--quarantine-file", quarantineFile],
    baseEnv,
  );
  const insightsOut = join(tmp, "insights-ci.json");
  runCli(
    ["insights", "--task-file", taskFile, "--event-file", eventFile, "--output-file", insightsOut, "--top-n", "5"],
    baseEnv,
  );
} finally {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

process.stdout.write("ci-health-local: ok\n");
