#!/usr/bin/env node
/**
 * 校验 .agent-farm/runs 或指定目录下的 *-*.json 阶段报告（M2）。
 * 用法：node scripts/validate-node-reports.mjs [dir]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? join(process.cwd(), "test", "fixtures", "node-reports");
const schema = JSON.parse(readFileSync(new URL("../schemas/node-stage-report.schema.json", import.meta.url), "utf8"));

function validateReport(obj, label) {
  const req = schema.required ?? [];
  for (const k of req) {
    if (obj[k] === undefined || obj[k] === null) {
      throw new Error(`${label}: 缺少 ${k}`);
    }
  }
  if (obj.schema_version !== 1) throw new Error(`${label}: schema_version 须为 1`);
  if (!["execute", "verify", "plan"].includes(obj.stage)) {
    throw new Error(`${label}: stage 非法`);
  }
}

function walk(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      n += walk(p);
      continue;
    }
    if (!/-\d+\.json$/.test(name) && !name.endsWith(".json")) continue;
    const raw = readFileSync(p, "utf8");
    const obj = JSON.parse(raw);
    validateReport(obj, p);
    n++;
  }
  return n;
}

const count = walk(root);
console.log(`validate-node-reports: OK (${count} files under ${root})`);
