#!/usr/bin/env node
/**
 * 本地复现「CI 健康巡检」最小两步：doctor --ci-exit + insights（jsonl 临时队列）。
 * 与 `.github/workflows/agent-farm-health-cron.yml` 精神对齐；不修改领域层。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const distCli = join(repoRoot, "dist", "interfaces", "cli", "index.js");
const tsx = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const srcCli = join(repoRoot, "src", "interfaces", "cli", "index.ts");

function resolveCliInvocation() {
  if (existsSync(distCli)) {
    return { argv: [distCli], label: "dist" };
  }
  if (existsSync(tsx) && existsSync(srcCli)) {
    return { argv: [tsx, srcCli], label: "tsx+src" };
  }
  console.error(
    "ci-health-local: 需要已 build 的 dist/interfaces/cli/index.js，或 dev 依赖 tsx + src。\n" +
      "  请先运行: npm run build\n" +
      "  或: npm install（含 devDependencies）",
  );
  process.exit(1);
}

const cli = resolveCliInvocation();

function runCli(args, extraEnv) {
  const r = spawnSync(process.execPath, [...cli.argv, ...args], {
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
  runCli(["doctor", "--ci-exit", "--task-file", taskFile, "--quarantine-file", quarantineFile], baseEnv);
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

process.stdout.write(`ci-health-local: ok (${cli.label})\n`);
