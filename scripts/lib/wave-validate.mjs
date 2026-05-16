/**
 * Wave 任务项统一校验（validate:waves、enqueue-task-wave、queue add）。
 */
import {
  lintWaveTaskPromptErrors,
  lintWaveTaskPromptStrictErrors,
  lintWaveTaskPromptWarnings,
} from "./wave-prompt-lint.mjs";

/**
 * @param {unknown} t
 * @param {string} prefix  如 "team-handoff-min.json 第 1 项"
 * @param {{ strictPrompt?: boolean }} [opts]
 */
export function validateWaveItem(t, prefix, opts = {}) {
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
  if (mode === "plan") {
    const ac = String(t.acceptance_criteria ?? "").trim();
    const prompt = String(t.prompt ?? "");
    if (!ac && !/验收/.test(prompt)) {
      throw new Error(`${prefix}：mode=plan 须在 prompt 含「验收」或提供非空 acceptance_criteria`);
    }
  }
  if (mode === "execute" || mode === undefined || mode === null || mode === "") {
    if (!String(t.acceptance_criteria ?? "").trim()) {
      throw new Error(`${prefix}：mode=execute 须提供非空 acceptance_criteria`);
    }
  }
  const prevStrict = process.env.AGENT_FARM_PROMPT_LINT_STRICT;
  if (opts.strictPrompt) process.env.AGENT_FARM_PROMPT_LINT_STRICT = "1";
  try {
    for (const err of [...lintWaveTaskPromptErrors(t, prefix), ...lintWaveTaskPromptStrictErrors(t, prefix)]) {
      throw new Error(err);
    }
  } finally {
    if (opts.strictPrompt) {
      if (prevStrict === undefined) delete process.env.AGENT_FARM_PROMPT_LINT_STRICT;
      else process.env.AGENT_FARM_PROMPT_LINT_STRICT = prevStrict;
    }
  }
  return lintWaveTaskPromptWarnings(t, prefix);
}

/**
 * @param {unknown[]} items
 * @param {string} fileLabel
 */
export function validateWaveArray(items, fileLabel) {
  if (!Array.isArray(items)) {
    throw new Error(`${fileLabel}：根须为数组`);
  }
  const allWarnings = [];
  items.forEach((item, i) => {
    const prefix = `${fileLabel} 第 ${i + 1} 项`;
    const warnings = validateWaveItem(item, prefix);
    allWarnings.push(...warnings);
  });
  return allWarnings;
}
