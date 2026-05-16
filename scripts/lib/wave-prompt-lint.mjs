/**
 * Wave / queue 任务 prompt 质量 lint（入队前 / validate:waves）。
 */

const MIN_PROMPT_LEN = 40;
const PATH_HINT = /(?:先读|Read\s|阅读\s|docs\/|src\/|\.md|\.ts)/i;
const EMPTY_RUN_HINT = /空转|git diff|git status/i;

/**
 * @param {Record<string, unknown>} t
 * @param {string} prefix
 * @returns {string[]} 错误（非空则拒绝）
 */
export function lintWaveTaskPromptErrors(t, prefix) {
  const errors = [];
  const prompt = String(t.prompt ?? "").trim();

  if (prompt.length < MIN_PROMPT_LEN) {
    errors.push(`${prefix}：prompt 过短（<${MIN_PROMPT_LEN} 字），请写清目标+约束+验收`);
  }

  return errors;
}

/**
 * @param {Record<string, unknown>} t
 * @param {string} prefix
 * @returns {string[]} 警告（不阻断）
 */
export function lintWaveTaskPromptWarnings(t, prefix) {
  const warnings = [];
  const prompt = String(t.prompt ?? "");
  const mode = String(t.mode ?? "execute");

  if (mode === "plan" && !/验收/.test(prompt)) {
    warnings.push(`${prefix}：plan 建议在 prompt 中写「验收」要点`);
  }

  if (mode === "execute") {
    if (!PATH_HINT.test(prompt)) {
      warnings.push(`${prefix}：execute 建议指明先读路径（docs/、src/），降低空转风险`);
    }
    if (!EMPTY_RUN_HINT.test(prompt) && !t.empty_run_grace_minutes) {
      warnings.push(`${prefix}：execute 建议含 git status / 禁止长时间无 diff 等约束`);
    }
  }

  return warnings;
}

/** 严格模式：路径/空转提示升级为错误（AGENT_FARM_PROMPT_LINT_STRICT=1） */
export function lintWaveTaskPromptStrictErrors(t, prefix) {
  if (process.env.AGENT_FARM_PROMPT_LINT_STRICT !== "1") return [];
  return lintWaveTaskPromptWarnings(t, prefix).map((w) => w.replace("建议", "须"));
}
