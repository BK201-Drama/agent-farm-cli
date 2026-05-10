#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
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

const bin = join(ROOT, "node_modules", ".bin");
process.env.PATH = process.env.PATH ? `${bin}${delimiter}${process.env.PATH}` : bin;

const distCli = join(ROOT, "dist", "interfaces", "cli", "index.js");
const useDistCli = existsSync(distCli);

const run = (args) => {
  const env = { ...process.env, AGENT_FARM_STORAGE: "sqlite" };
  const result = useDistCli
    ? spawnSync(process.execPath, [distCli, ...args], {
        cwd: ROOT,
        stdio: "inherit",
        env,
      })
    : spawnSync("agent-farm", args, {
        cwd: ROOT,
        stdio: "inherit",
        env,
        shell: true,
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
  'npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}';

run(["queue", "add", "--prompt", PROMPT, "--task-id", TASK_ID, "--dedupe-key", DEDUPE_KEY]);

const workerArgs = [
  "worker",
  "--workspace", ROOT,
  "--workers", "4",
  "--command-template", EXECUTOR_COMMAND_TEMPLATE,
  "--lease-timeout-seconds", "1800",
  "--poison-max-attempts", "3",
  "--isolate-opencode-db",
];
if (process.env.AGENT_FARM_GIT_WORKTREE === "0" || process.env.AGENT_FARM_GIT_WORKTREE === "false") {
  workerArgs.push("--shared-workspace");
}
if (process.env.AGENT_FARM_AUTO_MERGE !== "0" && process.env.AGENT_FARM_AUTO_MERGE !== "false") {
  workerArgs.push("--auto-merge");
}
run(workerArgs);

run(["insights"]);
run(["doctor"]);