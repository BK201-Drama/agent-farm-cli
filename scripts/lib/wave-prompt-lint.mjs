/**
 * 薄转发：实现位于 src/application/wave（编译到 dist）。
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distPath = join(dirname(fileURLToPath(import.meta.url)), "../../dist/application/wave/wave-prompt-lint.js");

if (!existsSync(distPath)) {
  console.error("[agent-farm] wave-prompt-lint: dist 未找到，请先执行 npm run build");
  process.exit(1);
}

export {
  lintWaveTaskPromptErrors,
  lintWaveTaskPromptWarnings,
  lintWaveTaskPromptStrictErrors,
} from "../../dist/application/wave/wave-prompt-lint.js";
