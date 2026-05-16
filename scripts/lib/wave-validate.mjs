/**
 * 薄转发：实现位于 src/application/wave（编译到 dist）。
 * 未 build 时提示先 npm run build。
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distPath = join(dirname(fileURLToPath(import.meta.url)), "../../dist/application/wave/wave-validate.js");

if (!existsSync(distPath)) {
  console.error(
    "[agent-farm] wave-validate: dist 未找到，请先执行 npm run build（实现已迁至 src/application/wave/）",
  );
  process.exit(1);
}

export { validateWaveItem, validateWaveArray } from "../../dist/application/wave/wave-validate.js";
