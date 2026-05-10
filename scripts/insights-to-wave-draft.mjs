#!/usr/bin/env node
/**
 * 读取 insights/doctor JSON 文件，从 failure_top / failure_hotspots 生成 wave 数组草稿。
 * 用法：node scripts/insights-to-wave-draft.mjs <json-file> [--top-n N]
 *
 * 输出：wave JSON 数组（task_id / dedupe_key / prompt / mode=execute），打印到 stdout。
 * 无失败数据时打印空数组 [] 并 stderr 一行说明。
 * 不写密钥、不自动 enqueue。
 */
import { readFileSync } from "node:fs";

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = null;
  let topN = 5;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top-n") {
      const n = parseInt(args[i + 1], 10);
      if (!Number.isNaN(n) && n > 0) {
        topN = Math.max(1, n);
      }
      i++;
    } else if (!filePath) {
      filePath = args[i];
    }
  }
  return { filePath, topN };
}

function main() {
  const { filePath, topN } = parseArgs();
  if (!filePath) {
    process.stderr.write("用法: node scripts/insights-to-wave-draft.mjs <json-file> [--top-n N]\n");
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    process.stderr.write(`insights-to-wave-draft: 无法读取文件 ${filePath}\n`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`insights-to-wave-draft: JSON 解析失败（${filePath}）：${msg}\n`);
    process.exit(1);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    process.stderr.write("insights-to-wave-draft: JSON 根须为对象（insights 或 doctor 报告）\n");
    process.exit(1);
  }

  const failures = Array.isArray(data.failure_top)
    ? data.failure_top
    : Array.isArray(data.failure_hotspots)
      ? data.failure_hotspots
      : [];

  const entries = failures.slice(0, topN);

  if (entries.length === 0) {
    process.stderr.write("insights-to-wave-draft: 无失败数据，跳过 wave 草稿生成\n");
    process.stdout.write("[]\n");
    return;
  }

  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const wave = entries.map((f, i) => {
    const reason = String(f.reason ?? f.error ?? "unknown reason").slice(0, 160);
    const count = Number(f.count ?? 0);
    const idx = String(i + 1).padStart(2, "0");
    const taskId = `draft-${dateStr}-${idx}`;
    const countHint = count > 0 ? `（发生 ${count} 次）\n` : "";
    return {
      task_id: taskId,
      dedupe_key: taskId,
      mode: "execute",
      prompt: `仓库根：agent-farm-cli。调查并修复以下高频失败：${countHint}${reason}\n验收：npm run check && npm test。`,
    };
  });

  process.stdout.write(JSON.stringify(wave, null, 2) + "\n");
}

main();
