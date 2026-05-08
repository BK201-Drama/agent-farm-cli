#!/usr/bin/env node
/**
 * 从 JSON 数组批量入队（每项含 task_id、dedupe_key、prompt）。
 * 用法：node scripts/enqueue-task-wave.mjs <wave.json>
 * wave 文件由你在本机维护，建议放在 .agent-farm/waves/（该目录默认 git 忽略，不会随包发布）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/interfaces/cli/index.js");

if (!process.argv[2]) {
  console.error(
    `用法: node scripts/enqueue-task-wave.mjs <wave.json>\n\n` +
      `所有 wave JSON 请放在本仓库的 .agent-farm/waves/ 下自行创建与编辑（不会进版本库、也不会打进 npm 包）。\n` +
      `示例：node scripts/enqueue-task-wave.mjs .agent-farm/waves/my-tasks.json`,
  );
  process.exit(1);
}

const waveFile = isAbsolute(process.argv[2])
  ? process.argv[2]
  : resolve(process.cwd(), process.argv[2]);

if (!existsSync(waveFile)) {
  console.error(`enqueue-task-wave: 未找到文件：${waveFile}`);
  process.exit(1);
}

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
