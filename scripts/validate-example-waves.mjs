#!/usr/bin/env node
/**
 * 校验 examples/waves/*.json：根为数组，每项含 task_id / dedupe_key / prompt；mode 若存在须为 plan|execute。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wavesDir = join(root, "examples", "waves");

function validateItem(t, file, index) {
  const prefix = `${file} 第 ${index + 1} 项`;
  if (typeof t !== "object" || t === null || Array.isArray(t)) {
    throw new Error(`${prefix}：须为对象`);
  }
  for (const key of ["task_id", "dedupe_key", "prompt"]) {
    if (!String(t[key] ?? "").trim()) {
      throw new Error(`${prefix}：缺少非空 ${key}`);
    }
  }
  const mode = t.mode;
  if (mode !== undefined && mode !== null && mode !== "" && mode !== "plan" && mode !== "execute") {
    throw new Error(`${prefix}：mode 须为 plan 或 execute`);
  }
}

let files;
try {
  files = readdirSync(wavesDir).filter((f) => f.endsWith(".json"));
} catch {
  console.error(`validate-example-waves: 未找到目录 ${wavesDir}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error("validate-example-waves: examples/waves 下无 .json 文件");
  process.exit(1);
}

for (const file of files) {
  const path = join(wavesDir, file);
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`validate-example-waves: 无法解析 ${path}: ${msg}`);
    process.exit(1);
  }
  if (!Array.isArray(data)) {
    console.error(`validate-example-waves: ${path} 根须为数组`);
    process.exit(1);
  }
  data.forEach((item, i) => {
    try {
      validateItem(item, file, i);
    } catch (e) {
      console.error(`validate-example-waves: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });
}

console.log(`validate-example-waves: ok (${files.length} file(s))`);
