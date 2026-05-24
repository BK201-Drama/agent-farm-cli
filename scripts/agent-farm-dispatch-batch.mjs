#!/usr/bin/env node
/**
 * Wave → worker：根据 .agent-farm/waves/ 下的 JSON 入队并启动 worker。
 * 用法：node scripts/agent-farm-dispatch-batch.mjs <wave.json>
 * Windows / 无 Bash 时与 .sh 等价。
 *
 * executor 选择优先级：.agent-farm/config.json > auto-detect > fallback claude
 *
 * 环境变量说明：
 *   AGENT_FARM_STORAGE          - 队列存储类型，默认 sqlite
 *   AGENT_FARM_AUTO_MERGE      - 启用后 worker 自动合并 PR；设为 0 可关闭
 *   AGENT_FARM_AUTO_MERGE_STASH - 自动 merge 前 stash 当前工作目录的修改
 *   AGENT_FARM_GIT_WORKTREE    - 启用 git worktree 隔离 worker 工作区；设为 0 关闭
 *   .agent-farm/profile.env     - 加载 API 密钥等配置（含 ANTHROPIC_API_KEY / OPENAI_API_KEY 等）
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
      `2. 传入该文件路径，将按 JSON 入队并启动 worker\n\n` +
      `示例: node scripts/agent-farm-dispatch-batch.mjs .agent-farm/waves/my-tasks.json`,
  );
  process.exit(1);
}

const wavePath = isAbsolute(waveArg) ? waveArg : resolve(process.cwd(), waveArg);

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
runCli(workerArgs);
