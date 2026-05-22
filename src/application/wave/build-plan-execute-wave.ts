import type { JsonMap } from "../../domain/task.js";

export type BuildPlanExecuteWaveInput = {
  /** URL-safe slug，用于 task_id / dedupe_key 前缀 */
  slug: string;
  /** 本波要实现的目标（写入 prompt） */
  goal: string;
  /** 仓库描述，如「本仓库」或包名 */
  repoLabel?: string;
  /** plan 阶段建议 Read 的路径 */
  planReadPaths?: string[];
  /** execute 阶段建议 Read 的路径 */
  executeReadPaths?: string[];
  /** plan 验收描述（须满足 wave 校验：prompt 含「验收」或单独字段） */
  acceptancePlan?: string;
  /** execute 的 acceptance_criteria */
  acceptanceExecute?: string;
  /** YYYYMMDD；默认当天 UTC */
  dateStamp?: string;
};

export function sanitizeWaveSlug(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) {
    throw new Error("slug 须包含字母或数字（可用中文标题自动生成时传入 --slug）");
  }
  return s.slice(0, 48);
}

export function defaultWaveDateStamp(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function buildPlanExecuteWave(input: BuildPlanExecuteWaveInput): JsonMap[] {
  const slug = sanitizeWaveSlug(input.slug);
  const goal = String(input.goal ?? "").trim();
  if (!goal) {
    throw new Error("goal 不能为空");
  }
  const repo = String(input.repoLabel ?? "本仓库").trim() || "本仓库";
  const stamp = String(input.dateStamp ?? defaultWaveDateStamp()).trim();
  const planRead = input.planReadPaths?.length
    ? [...input.planReadPaths]
    : ["docs/agents/wave-prompt-playbook.md", "src/"];
  const executeRead = input.executeReadPaths?.length
    ? [...input.executeReadPaths]
    : ["docs/agents/wave-prompt-playbook.md"];
  const acceptancePlan =
    String(input.acceptancePlan ?? "").trim() || "`npm run check` 必须通过";
  const acceptanceExecute =
    String(input.acceptanceExecute ?? "").trim() || "npm run check && npm test";

  const baseId = `${slug}-${stamp}`;
  const planPathsLine = planRead.map((p) => p.trim()).filter(Boolean).join("、");
  const executePathsLine = executeRead.map((p) => p.trim()).filter(Boolean).join("、");

  const planPrompt =
    `仓库根：${repo}。目标：${goal}\n` +
    `先 Read ${planPathsLine}。输出实现清单（文件路径 + 验收要点）；不写代码。\n\n` +
    `验收：${acceptancePlan}`;

  const executePrompt =
    `仓库根：${repo}。目标：${goal}\n` +
    `先 Read 上一条 plan 产出与 ${executePathsLine}。按清单实现；若已满足则只补测试。` +
    `禁止超过 10 分钟无任何 git diff；每步后 git status。\n\n` +
    `验收：${acceptanceExecute}`;

  return [
    {
      task_id: `${baseId}-plan`,
      dedupe_key: `${baseId}-plan`,
      mode: "plan",
      priority: 2,
      read_paths: planRead,
      prompt: planPrompt,
    },
    {
      task_id: `${baseId}-execute`,
      dedupe_key: `${baseId}-execute`,
      mode: "execute",
      priority: 3,
      read_paths: executeRead,
      empty_run_grace_minutes: 10,
      prompt: executePrompt,
      acceptance_criteria: acceptanceExecute,
    },
  ];
}

export function defaultWaveOutputPath(cwd: string, slug: string, dateStamp?: string): string {
  const s = sanitizeWaveSlug(slug);
  const stamp = String(dateStamp ?? defaultWaveDateStamp()).trim();
  return `${cwd}/.agent-farm/waves/${s}-${stamp}.json`.replace(/\\/g, "/");
}
