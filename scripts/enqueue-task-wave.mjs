#!/usr/bin/env node
/**
 * 从 JSON 数组批量入队（每项含 task_id、dedupe_key、prompt）。
 * 用法：node scripts/enqueue-task-wave.mjs [wave.json 路径，默认 scripts/waves/optimization-wave.json]
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/interfaces/cli/index.js");

const waveFile = process.argv[2]
  ? isAbsolute(process.argv[2])
    ? process.argv[2]
    : resolve(process.cwd(), process.argv[2])
  : join(root, "scripts/waves/optimization-wave.json");

process.env.AGENT_FARM_STORAGE = process.env.AGENT_FARM_STORAGE ?? "sqlite";

const raw = readFileSync(waveFile, "utf8");
const tasks = JSON.parse(raw);
if (!Array.isArray(tasks)) {
  console.error("enqueue-task-wave: JSON 根须为数组");
  process.exit(1);
}

for (const t of tasks) {
  const taskId = String(t.task_id ?? "").trim();
  const dedupe = String(t.dedupe_key ?? "").trim();
  const prompt = String(t.prompt ?? "");
  if (!taskId || !dedupe || !prompt) {
    console.error("enqueue-task-wave: 每项需含 task_id、dedupe_key、prompt", t);
    process.exit(1);
  }
  const r = spawnSync(
    process.execPath,
    [cli, "queue", "add", "--task-id", taskId, "--dedupe-key", dedupe, "--prompt", prompt],
    { cwd: root, stdio: "inherit", env: { ...process.env } },
  );
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log(`\n[enqueue-task-wave] 已从 ${waveFile} 入队 ${tasks.length} 条任务。`);
