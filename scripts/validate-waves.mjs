#!/usr/bin/env node
/**
 * 校验 wave JSON：默认 examples/waves + 存在的 .agent-farm/waves。
 * 用法：node scripts/validate-waves.mjs [目录...]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWaveArray } from "./lib/wave-validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectWaveDirs(argvDirs) {
  if (argvDirs.length > 0) {
    return argvDirs.map((d) => (d.startsWith("/") || /^[A-Za-z]:/.test(d) ? d : resolve(process.cwd(), d)));
  }
  const dirs = [join(root, "examples", "waves")];
  const local = join(root, ".agent-farm", "waves");
  if (existsSync(local)) dirs.push(local);
  return dirs;
}

function isAgentFarmWavesDir(dir) {
  return dir.replace(/\\/g, "/").endsWith(".agent-farm/waves");
}

/** 跳过 _ 前缀 noop；其余 .agent-farm/waves/*.json 均校验（历史 wave 已迁移 acceptance_criteria）。 */
function shouldIncludeAgentFarmWaveFile(name) {
  return name.endsWith(".json") && !name.startsWith("_");
}

function listJsonFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => {
        if (!f.endsWith(".json") || f.endsWith(".example.json") || f.startsWith("_")) {
          return false;
        }
        if (isAgentFarmWavesDir(dir) && !shouldIncludeAgentFarmWaveFile(f)) {
          return false;
        }
        return true;
      })
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

const dirs = collectWaveDirs(process.argv.slice(2));
let totalFiles = 0;
let totalWarnings = 0;

for (const wavesDir of dirs) {
  const files = listJsonFiles(wavesDir);
  if (files.length === 0) continue;
  for (const path of files) {
    const fileLabel = path.replace(/\\/g, "/").split("/").slice(-2).join("/");
    let data;
    try {
      data = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`validate-waves: 无法解析 ${path}: ${msg}`);
      process.exit(1);
    }
    try {
      const warnings = validateWaveArray(data, fileLabel);
      for (const w of warnings) {
        console.warn(`validate-waves: warn: ${w}`);
        totalWarnings++;
      }
    } catch (e) {
      console.error(`validate-waves: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
    totalFiles++;
  }
}

if (totalFiles === 0) {
  console.error(`validate-waves: 未找到 wave JSON（目录：${dirs.join(", ")}）`);
  process.exit(1);
}

console.log(
  `validate-waves: ok (${totalFiles} file(s)${totalWarnings > 0 ? `, ${totalWarnings} warning(s)` : ""})`,
);
