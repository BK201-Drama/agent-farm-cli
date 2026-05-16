/**
 * 薄转发：实现位于 src/application/wave（编译到 dist）。
 * dist 缺失时用 tsx 加载 .ts，避免并行测试时 clean-dist 导致 ERR_MODULE_NOT_FOUND。
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const distPath = join(root, "dist/application/wave/wave-validate.js");
const srcPath = join(root, "src/application/wave/wave-validate.ts");
const tsxApi = join(root, "node_modules/tsx/dist/esm/api/index.mjs");

async function loadWaveValidateModule() {
  if (existsSync(distPath)) {
    try {
      return await import(pathToFileURL(distPath).href);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code !== "ERR_MODULE_NOT_FOUND") throw e;
    }
  }
  if (existsSync(srcPath) && existsSync(tsxApi)) {
    const { register } = await import(pathToFileURL(tsxApi).href);
    register();
    return await import(pathToFileURL(srcPath).href);
  }
  console.error(
    "[agent-farm] wave-validate: 需要 dist 或 src+tsx。请先 npm run build，或 npm install（devDependencies）。",
  );
  process.exit(1);
}

const mod = await loadWaveValidateModule();
export const validateWaveItem = mod.validateWaveItem;
export const validateWaveArray = mod.validateWaveArray;
