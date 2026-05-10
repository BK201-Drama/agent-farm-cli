#!/usr/bin/env node
/**
 * 一次性：recover-stale → wave 入队 → OpenCode worker（与 agent-farm-dispatch-batch.mjs 等价，但先回收僵死租约）。
 * 用法：node scripts/agent-farm-recover-and-wave.mjs <wave.json>
 * npm：npm run farm:recover-wave -- test/fixtures/waves/your-wave.json
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const waveArg = process.argv[2];
if (!waveArg) {
  console.error(
    "用法: node scripts/agent-farm-recover-and-wave.mjs <wave.json>\n" +
      "示例: npm run farm:recover-wave -- test/fixtures/waves/one-shot-cursor-20260510.json",
  );
  process.exit(1);
}

const distCli = join(ROOT, "dist", "interfaces", "cli", "index.js");
if (!existsSync(distCli)) {
  console.error("agent-farm: 请先 npm run build（缺少 dist/interfaces/cli/index.js）");
  process.exit(1);
}

const env = { ...process.env, AGENT_FARM_STORAGE: "sqlite" };
const recover = spawnSync(
  process.execPath,
  [distCli, "queue", "recover-stale", "--lease-timeout-seconds", "1800"],
  { cwd: ROOT, stdio: "inherit", env },
);
if (recover.status !== 0 && recover.status !== null) {
  console.error(`[agent-farm-recover-and-wave] recover-stale 退出码 ${recover.status}，仍继续入队与 worker…`);
}

const wavePath = isAbsolute(waveArg) ? waveArg : resolve(process.cwd(), waveArg);
const batch = join(ROOT, "scripts", "agent-farm-dispatch-batch.mjs");
const run = spawnSync(process.execPath, [batch, wavePath], { cwd: ROOT, stdio: "inherit", env });
process.exit(run.status ?? 1);
