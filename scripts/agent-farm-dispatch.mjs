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
  console.error('Usage: node scripts/agent-farm-dispatch.mjs "task prompt"');
  process.exit(1);
}

const TASK_ID = `task-${Date.now()}`;
const DEDUPE_KEY = `manual:${TASK_ID}`;

// ── executor 解析：config.json > auto-detect > fallback claude ──
const EXECUTOR_PRESETS = {
  opencode:
    'npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}',
  codex: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox {prompt}",
  claude: "claude -p {prompt} --output-format stream-json --verbose --dangerously-skip-permissions",
};

function resolveExecutor() {
  const configPath = join(ROOT, ".agent-farm", "config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      const id = config.executor;
      if (id && id !== "cursor-sdk" && EXECUTOR_PRESETS[id]) {
        return { template: EXECUTOR_PRESETS[id], executor: id };
      }
      if (id === "cursor-sdk") {
        return { template: EXECUTOR_PRESETS.claude, executor: "claude" };
      }
    } catch {
      /* best-effort */
    }
  }
  // auto-detect
  for (const [name, tpl] of Object.entries(EXECUTOR_PRESETS)) {
    const bin = tpl.split(" ")[0];
    const which = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim()) return { template: tpl, executor: name };
  }
  return { template: EXECUTOR_PRESETS.claude, executor: "claude" };
}

const resolved = resolveExecutor();

function workerExtras(executor) {
  const extras = [];
  if (executor === "opencode") extras.push("--isolate-opencode-db", "--opencode-json-events");
  else if (executor === "claude") extras.push("--isolate-claude-db", "--claude-json-events");
  return extras;
}

run(["queue", "add", "--prompt", PROMPT, "--task-id", TASK_ID, "--dedupe-key", DEDUPE_KEY]);

const workerArgs = [
  "worker",
  "--workspace",
  ROOT,
  "--workers",
  "4",
  "--command-template",
  resolved.template,
  "--lease-timeout-seconds",
  "1800",
  "--poison-max-attempts",
  "3",
  ...workerExtras(resolved.executor),
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
