#!/usr/bin/env node
/**
 * Cursor 状态行：队列计数 + stuck 风险（需本仓库已 build 或 npx agent-farm）
 * 示例（settings status line）：node scripts/farm-status-line.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/interfaces/cli/index.js");

function run(args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
  });
  return r.status === 0 ? r.stdout.trim() : "";
}

const stuckBrief = run(["stuck", "list", "--brief"]);
const statusJson = run(["status"]);
let line = "agent-farm";
if (stuckBrief) {
  const first = stuckBrief.split("\n")[0] ?? "";
  if (first && !first.includes("未发现")) line = first.replace(/^stuck:\s*/, "af:");
}
if (statusJson) {
  try {
    const s = JSON.parse(statusJson);
    const t = s.tasks_total ?? s.task_count;
    if (t != null) line = `${line} tasks:${t}`;
  } catch {
    /* ignore */
  }
}
process.stdout.write(line.slice(0, 120));
