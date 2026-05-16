/**
 * Wave 任务项统一校验（validate:waves、enqueue-task-wave、queue add）。
 */
import {
  lintWaveTaskPromptErrors,
  lintWaveTaskPromptStrictErrors,
  lintWaveTaskPromptWarnings,
} from "./wave-prompt-lint.js";

export type ValidateWaveItemOptions = {
  strictPrompt?: boolean;
};

export function validateWaveItem(
  t: unknown,
  prefix: string,
  opts: ValidateWaveItemOptions = {},
): string[] {
  if (typeof t !== "object" || t === null || Array.isArray(t)) {
    throw new Error(`${prefix}：须为对象`);
  }
  const item = t as Record<string, unknown>;
  for (const key of ["task_id", "dedupe_key", "prompt"]) {
    if (!String(item[key] ?? "").trim()) {
      throw new Error(`${prefix}：缺少非空 ${key}`);
    }
  }
  const mode = item.mode;
  if (
    mode !== undefined &&
    mode !== null &&
    mode !== "" &&
    mode !== "plan" &&
    mode !== "execute" &&
    mode !== "verify"
  ) {
    throw new Error(`${prefix}：mode 须为 plan、execute 或 verify`);
  }
  if (mode === "plan") {
    const ac = String(item.acceptance_criteria ?? "").trim();
    const prompt = String(item.prompt ?? "");
    if (!ac && !/验收/.test(prompt)) {
      throw new Error(`${prefix}：mode=plan 须在 prompt 含「验收」或提供非空 acceptance_criteria`);
    }
  }
  if (mode === "execute" || mode === undefined || mode === null || mode === "") {
    if (!String(item.acceptance_criteria ?? "").trim()) {
      throw new Error(`${prefix}：mode=execute 须提供非空 acceptance_criteria`);
    }
  }
  if (mode === "verify") {
    if (!String(item.acceptance_criteria ?? "").trim()) {
      throw new Error(`${prefix}：mode=verify 须提供非空 acceptance_criteria（验收脚本或检查点）`);
    }
    const vtpl = String(item.verify_command_template ?? "").trim();
    if (!vtpl && !/verify|验收|检查/.test(String(item.prompt ?? ""))) {
      throw new Error(`${prefix}：mode=verify 须在 prompt 提及验收/检查，或提供 verify_command_template`);
    }
  }
  const prevStrict = process.env.AGENT_FARM_PROMPT_LINT_STRICT;
  if (opts.strictPrompt) process.env.AGENT_FARM_PROMPT_LINT_STRICT = "1";
  try {
    for (const err of [
      ...lintWaveTaskPromptErrors(item, prefix),
      ...lintWaveTaskPromptStrictErrors(item, prefix),
    ]) {
      throw new Error(err);
    }
  } finally {
    if (opts.strictPrompt) {
      if (prevStrict === undefined) delete process.env.AGENT_FARM_PROMPT_LINT_STRICT;
      else process.env.AGENT_FARM_PROMPT_LINT_STRICT = prevStrict;
    }
  }
  return lintWaveTaskPromptWarnings(item, prefix);
}

export function validateWaveArray(items: unknown[], fileLabel: string): string[] {
  if (!Array.isArray(items)) {
    throw new Error(`${fileLabel}：根须为数组`);
  }
  const allWarnings: string[] = [];
  items.forEach((item, i) => {
    const prefix = `${fileLabel} 第 ${i + 1} 项`;
    const warnings = validateWaveItem(item, prefix);
    allWarnings.push(...warnings);
  });
  return allWarnings;
}
