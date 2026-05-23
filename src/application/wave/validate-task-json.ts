import type { JsonMap } from "../../domain/task.js";
import { validateWaveItem } from "./wave-validate.js";

/** queue add / API 入队前校验；警告打 stderr，错误抛异常。 */
export async function validateTaskJsonBeforeEnqueue(task: JsonMap, label = "queue add"): Promise<void> {
  const strict = process.env.AGENT_FARM_PROMPT_LINT_STRICT === "1";
  const warnings = validateWaveItem(task, label, { strictPrompt: strict });
  for (const w of warnings) {
    console.warn(`[agent-farm] ${w}`);
  }
}
