#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PROFILE = join(ROOT, ".agent-farm", "profile.env");
if (existsSync(PROFILE)) {
  const lines = readFileSync(PROFILE, "utf8");
  for (const line of lines.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key) process.env[key] = val;
  }
}

process.env.PATH = join(ROOT, "node_modules", ".bin") + ":" + process.env.PATH;

const CLI = existsSync(join(ROOT, "dist", "interfaces", "cli", "index.js"))
  ? join(ROOT, "dist", "interfaces", "cli", "index.js")
  : "agent-farm";

const run = (args) => {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, AGENT_FARM_STORAGE: "sqlite" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
};

const PROMPT = process.argv[2];
if (!PROMPT) {
  console.error("Usage: node scripts/agent-farm-dispatch.mjs \"task prompt\"");
  process.exit(1);
}

const TASK_ID = `task-${Date.now()}`;
const DEDUPE_KEY = `manual:${TASK_ID}`;

const EXECUTOR_COMMAND_TEMPLATE =
  'npx --prefix="$AGENT_FARM_WORKSPACE" opencode-ai run --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}';

run(["queue", "add", "--prompt", PROMPT, "--task-id", TASK_ID, "--dedupe-key", DEDUPE_KEY]);

run([
  "worker",
  "--workspace", ROOT,
  "--workers", "4",
  "--command-template", EXECUTOR_COMMAND_TEMPLATE,
  "--lease-timeout-seconds", "1800",
  "--poison-max-attempts", "3",
]);

run(["insights"]);
run(["doctor"]);