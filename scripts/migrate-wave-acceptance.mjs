#!/usr/bin/env node
/**
 * 为历史 wave 中缺 acceptance_criteria 的 execute 项补字段（从 prompt 推断）。
 * 用法：node scripts/migrate-wave-acceptance.mjs [目录，默认 .agent-farm/waves]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.cwd(), process.argv[2] ?? ".agent-farm/waves");

function inferAcceptance(prompt) {
  const p = String(prompt ?? "");
  const m = p.match(/验收[：:]\s*[`"]?([^`"\n]+)[`"]?/);
  if (m) {
    return m[1]
      .replace(/必须通过[。.]?$/u, "")
      .replace(/全绿$/u, "全绿")
      .trim();
  }
  if (/npm run check && npm test/.test(p)) return "npm run check && npm test";
  if (/npm run check/.test(p)) return "npm run check";
  if (/npm test/.test(p)) return "npm test";
  if (/只读|不要修改任何文件/.test(p)) return "npm run check";
  return "npm run check && npm test";
}

let changedFiles = 0;
let changedTasks = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
  const path = join(dir, file);
  const items = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(items)) continue;
  let fileChanged = false;
  for (const t of items) {
    const mode = t.mode ?? "execute";
    if (mode !== "execute") continue;
    if (String(t.acceptance_criteria ?? "").trim()) continue;
    t.acceptance_criteria = inferAcceptance(t.prompt);
    fileChanged = true;
    changedTasks++;
  }
  if (fileChanged) {
    writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    changedFiles++;
    console.log(`updated ${file} (${items.length} items)`);
  }
}

console.log(`migrate-wave-acceptance: ${changedFiles} file(s), ${changedTasks} task(s)`);
