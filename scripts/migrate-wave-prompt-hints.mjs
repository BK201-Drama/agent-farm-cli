#!/usr/bin/env node
/**
 * 为 execute prompt 补「先 Read / git status / 空转」约束，满足 prompt lint。
 * 用法：node scripts/migrate-wave-prompt-hints.mjs [目录，默认 .agent-farm/waves examples/waves]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  lintWaveTaskPromptWarnings,
} from "./lib/wave-prompt-lint.mjs";

const PATH_HINT = /(?:先读|Read\s|阅读\s|docs\/|src\/|\.md|\.ts)/i;
const EMPTY_RUN_HINT = /空转|git diff|git status/i;
const EXECUTE_FOOTER =
  "\n\n先 Read 相关 docs/ 与 src/ 路径；禁止超过 10 分钟无任何 git diff；每步后 git status。";

const dirs = process.argv.slice(2).map((d) => resolve(process.cwd(), d));
if (dirs.length === 0) {
  dirs.push(resolve(process.cwd(), ".agent-farm/waves"), resolve(process.cwd(), "examples/waves"));
}

let changedFiles = 0;
let changedTasks = 0;

for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    const path = join(dir, file);
    const items = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(items)) continue;
    let fileChanged = false;
    items.forEach((t, i) => {
      const mode = String(t.mode ?? "execute");
      if (mode === "plan") {
        const prompt = String(t.prompt ?? "");
        if (!/验收/.test(prompt) && !String(t.acceptance_criteria ?? "").trim()) {
          t.prompt = `${prompt.trimEnd()}\n\n验收：npm run check 通过。`;
          fileChanged = true;
          changedTasks++;
        }
        return;
      }
      if (mode !== "execute") return;
      let prompt = String(t.prompt ?? "");
      const needsPath = !PATH_HINT.test(prompt);
      const needsEmpty = !EMPTY_RUN_HINT.test(prompt) && t.empty_run_grace_minutes == null;
      if (!needsPath && !needsEmpty) return;
      if (needsPath && !/docs\//.test(prompt) && !/src\//.test(prompt)) {
        if (!/先 Read|先读/.test(prompt)) {
          prompt = `先 Read 仓库内相关 src/ 与 docs/。\n${prompt}`;
        }
      }
      if (needsEmpty && !EMPTY_RUN_HINT.test(prompt)) {
        prompt = `${prompt.trimEnd()}${EXECUTE_FOOTER}`;
      }
      if (prompt !== String(t.prompt ?? "")) {
        t.prompt = prompt;
        fileChanged = true;
        changedTasks++;
      }
      const warnings = lintWaveTaskPromptWarnings(t, `${file} 第 ${i + 1} 项`);
      if (warnings.length > 0 && t.empty_run_grace_minutes == null) {
        t.empty_run_grace_minutes = 10;
        fileChanged = true;
      }
    });
    if (fileChanged) {
      writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`, "utf8");
      changedFiles++;
      console.log(`updated ${path}`);
    }
  }
}

console.log(`migrate-wave-prompt-hints: ${changedFiles} file(s), ${changedTasks} task(s)`);
