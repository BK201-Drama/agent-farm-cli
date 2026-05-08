#!/usr/bin/env node
/**
 * 从 JSON 数组批量入队（每项含 task_id、dedupe_key、prompt）。
 * 用法：node scripts/enqueue-task-wave.mjs [wave.json 路径]
 * 未传路径时：优先 .agent-farm/waves/optimization-wave.json，否则 examples/agent-farm-waves/optimization-wave.json。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/interfaces/cli/index.js");

const defaultLocalWave = join(root, ".agent-farm/waves/optimization-wave.json");
const templateWave = join(root, "examples/agent-farm-waves/optimization-wave.json");

let waveFile;
if (process.argv[2]) {
  waveFile = isAbsolute(process.argv[2])
    ? process.argv[2]
    : resolve(process.cwd(), process.argv[2]);
} else {
  waveFile = existsSync(defaultLocalWave) ? defaultLocalWave : templateWave;
}

if (!existsSync(waveFile)) {
  console.error(
    `enqueue-task-wave: 未找到波次文件：${waveFile}\n` +
      `请将 ${templateWave} 复制到 ${defaultLocalWave}，或传入 wave.json 路径。`,
  );
  process.exit(1);
}

if (!process.argv[2] && waveFile === templateWave) {
  console.warn(
    `[enqueue-task-wave] 未检测到 ${defaultLocalWave}，使用仓库模板 ${templateWave}。\n` +
      `自定义波次请写入 .agent-farm/waves/（随 .agent-farm 目录被 git 忽略）。`,
  );
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
