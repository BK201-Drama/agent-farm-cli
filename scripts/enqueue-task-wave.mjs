#!/usr/bin/env node
/**
 * 从 JSON 数组批量入队；每项为完整任务对象，经 `queue add --task-json` 写入（支持 mode、priority、acceptance_criteria 等）。
 * 用法：node scripts/enqueue-task-wave.mjs <wave.json>
 * 建议将 wave 放在 .agent-farm/waves/（默认 git 忽略）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCli = join(root, "dist", "interfaces", "cli", "index.js");
const useDistCli = existsSync(distCli);
/** 与 `resolveQueueWorkspace(process.cwd())` 对齐；勿写死仓库根，便于测试在临时 cwd 隔离 SQLite。 */
const queueWorkspaceCwd = process.cwd();

function validateTaskEntry(t, index) {
  const prefix = `第 ${index + 1} 项`;
  if (typeof t !== "object" || t === null || Array.isArray(t)) {
    throw new Error(`${prefix}：须为对象`);
  }
  const taskId = String(t.task_id ?? "").trim();
  const dedupe = String(t.dedupe_key ?? "").trim();
  const prompt = String(t.prompt ?? "");
  if (!taskId || !dedupe || !prompt) {
    throw new Error(`${prefix}：须含非空 task_id、dedupe_key、prompt`);
  }
  const mode = t.mode;
  if (mode !== undefined && mode !== null && mode !== "" && mode !== "plan" && mode !== "execute") {
    throw new Error(`${prefix}：mode 须为 plan 或 execute，当前为 ${JSON.stringify(mode)}`);
  }
  return { ...t, task_id: taskId, dedupe_key: dedupe, prompt };
}

if (!process.argv[2]) {
  console.error(
    `用法: node scripts/enqueue-task-wave.mjs <wave.json>\n\n` +
      `根为 JSON 数组；每项为任务对象（与 queue add --task-json 一致），至少含 task_id、dedupe_key、prompt。\n` +
      `可选：mode（plan|execute）、priority、acceptance_criteria、skip_ai_review、ai_review_command_template 等。\n` +
      `示例：node scripts/enqueue-task-wave.mjs .agent-farm/waves/my-tasks.json\n` +
      `字段说明：与 queue add --task-json 相同；README「Wave 文件最小示例」。`,
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

let tasks;
try {
  tasks = JSON.parse(readFileSync(waveFile, "utf8"));
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`enqueue-task-wave: 无法解析 JSON（${waveFile}）：${msg}`);
  process.exit(1);
}

if (!Array.isArray(tasks)) {
  console.error("enqueue-task-wave: JSON 根须为数组");
  process.exit(1);
}

let normalized;
try {
  normalized = tasks.map((t, i) => validateTaskEntry(t, i));
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`enqueue-task-wave: ${msg}`);
  process.exit(1);
}

/**
 * 同波去重：检测同一 wave 数组内重复的 task_id / dedupe_key。
 *
 * 取舍说明：选择 warn + continue（跳过重复项）而非 exit 1，理由：
 * 1) 重复项通常由自动生成 wave 时的并发或拼接问题导致，阻断整波会丢失其他有效任务；
 * 2) DB 层 dedupe_key 已提供二次防护（AddTaskUseCase.assertNoDuplicateDedupeKey），
 *    入队时也会被拦截，此处提前跳过可避免无意义的 spawn；
 * 3) 用户看到 stderr 警告后可修正 wave 后重放，不影响已入队的非重复任务。
 *
 * 需同时检查 task_id 和 dedupe_key：按 AGENTS.md，绝大多数场景 dedupe_key === task_id，
 * 但二者语义不同，各自去重更严谨。
 */
function dedupeInWave(entries) {
  const seenTaskIds = new Set();
  const seenDedupeKeys = new Set();
  const deduped = [];
  for (const t of entries) {
    const dupReasons = [];
    if (seenTaskIds.has(t.task_id)) {
      dupReasons.push(`task_id=${t.task_id}`);
    }
    if (seenDedupeKeys.has(t.dedupe_key)) {
      dupReasons.push(`dedupe_key=${t.dedupe_key}`);
    }
    if (dupReasons.length > 0) {
      console.error(
        `[enqueue-task-wave] 同波重复（跳过）：${dupReasons.join("，")}`,
      );
      continue;
    }
    seenTaskIds.add(t.task_id);
    seenDedupeKeys.add(t.dedupe_key);
    deduped.push(t);
  }
  return deduped;
}

const deduped = dedupeInWave(normalized);
if (deduped.length < normalized.length) {
  console.error(
    `[enqueue-task-wave] 同波去重：原始 ${normalized.length} 条，去重后 ${deduped.length} 条`,
  );
}

const spawnEnv = { ...process.env, AGENT_FARM_STORAGE: process.env.AGENT_FARM_STORAGE ?? "sqlite" };

for (const task of deduped) {
  const taskJson = JSON.stringify(task);
  const r = useDistCli
    ? spawnSync(process.execPath, [distCli, "queue", "add", "--task-json", taskJson], {
        cwd: queueWorkspaceCwd,
        stdio: "inherit",
        env: spawnEnv,
      })
    : spawnSync("agent-farm", ["queue", "add", "--task-json", taskJson], {
        cwd: queueWorkspaceCwd,
        stdio: "inherit",
        env: spawnEnv,
        shell: true,
      });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log(`\n[enqueue-task-wave] 已从 ${waveFile} 入队 ${deduped.length} 条任务。`);
