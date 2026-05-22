#!/usr/bin/env node
/**
 * Cursor 状态行：stuck 摘要 + 活跃状态计数 + 任务总数（需本仓库已 build 或 npx agent-farm）
 * 示例（settings status line）：node scripts/farm-status-line.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatFarmStatusLine } from "./lib/farm-status-line-format.mjs";

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
/** @type {import("./lib/farm-status-line-format.mjs").StatusPayload | undefined} */
let status;
if (statusJson) {
  try {
    status = JSON.parse(statusJson);
  } catch {
    /* ignore */
  }
}

process.stdout.write(formatFarmStatusLine({ stuckBrief, status }));
