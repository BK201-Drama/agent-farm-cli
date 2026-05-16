import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { JsonMap } from "../../domain/task.js";

type WaveValidateModule = {
  validateWaveItem: (
    t: unknown,
    prefix: string,
    opts?: { strictPrompt?: boolean },
  ) => string[];
};

let cached: WaveValidateModule | null = null;

async function loadWaveValidate(): Promise<WaveValidateModule> {
  if (cached) return cached;
  const script = join(process.cwd(), "scripts", "lib", "wave-validate.mjs");
  if (!existsSync(script)) {
    throw new Error(`wave validate script missing: ${script}`);
  }
  cached = (await import(pathToFileURL(script).href)) as WaveValidateModule;
  return cached;
}

/** queue add / API 入队前校验；警告打 stderr，错误抛异常。 */
export async function validateTaskJsonBeforeEnqueue(
  task: JsonMap,
  label = "queue add",
): Promise<void> {
  const mod = await loadWaveValidate();
  const strict = process.env.AGENT_FARM_PROMPT_LINT_STRICT === "1";
  const warnings = mod.validateWaveItem(task, label, { strictPrompt: strict });
  for (const w of warnings) {
    console.warn(`[agent-farm] ${w}`);
  }
}
