#!/usr/bin/env node
/**
 * Wave → OpenCode：根据 .agent-farm/waves/ 下的 JSON 入队并启动 worker（仅此流程）。
 * 用法：node scripts/agent-farm-dispatch-batch.mjs <wave.json>
 * Windows / 无 Bash 时与 .sh 等价。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PROFILE = join(ROOT, ".agent-farm", "profile.env");
if (existsSync(PROFILE)) {
  for (const line of readFileSync(PROFILE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key) process.env[key] = val;
  }
}

const bin = join(ROOT, "node_modules", ".bin");
process.env.PATH = process.env.PATH ? `${bin}${delimiter}${process.env.PATH}` : bin;

const distCli = join(ROOT, "dist", "interfaces", "cli", "index.js");
const useDistCli = existsSync(distCli);

const runCli = (args) => {
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
};

const waveArg = process.argv[2];
if (!waveArg) {
  console.error(
    `用法: node scripts/agent-farm-dispatch-batch.mjs <wave.json>\n\n` +
      `1. 在 .agent-farm/waves/ 下创建 wave JSON（git 忽略）\n` +
      `2. 传入该文件路径，将按 JSON 入队并启动 OpenCode worker\n\n` +
      `示例: node scripts/agent-farm-dispatch-batch.mjs .agent-farm/waves/my-tasks.json`,
  );
  process.exit(1);
}

const wavePath = isAbsolute(waveArg) ? waveArg : resolve(process.cwd(), waveArg);

const EXECUTOR_COMMAND_TEMPLATE =
  'npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}';

const enqueueScript = join(ROOT, "scripts", "enqueue-task-wave.mjs");
const enq = spawnSync(process.execPath, [enqueueScript, wavePath], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, AGENT_FARM_STORAGE: "sqlite" },
});
if (enq.status !== 0) process.exit(enq.status ?? 1);

const workerArgs = [
  "worker",
  "--workspace",
  ROOT,
  "--workers",
  "4",
  "--command-template",
  EXECUTOR_COMMAND_TEMPLATE,
  "--lease-timeout-seconds",
  "1800",
  "--poison-max-attempts",
  "3",
  "--isolate-opencode-db",
];
if (process.env.AGENT_FARM_GIT_WORKTREE === "0" || process.env.AGENT_FARM_GIT_WORKTREE === "false") {
  workerArgs.push("--shared-workspace");
}
runCli(workerArgs);
