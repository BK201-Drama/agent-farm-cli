/**
 * Auto-Wave Decompose Service
 *
 * 自然语言需求 → wave JSON 的自动拆解服务。
 * 使用 shell-based LLM（claude / opencode）将需求拆解为 1 个 plan + N 个 execute 子任务。
 */
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import type { JsonMap } from "../../domain/task.js";
import { defaultShellRunner } from "../../infrastructure/process/shell.js";
import { validateWaveArray } from "./wave-validate.js";
import { defaultWaveDateStamp } from "./build-plan-execute-wave.js";

const WAVE_TASK_SCHEMA_DOC = /* json */ `
每个任务为一个 JSON 对象，字段：
- task_id (必填, string): 唯一标识，格式 "<slug>-<YYYYMMDD>-<mode>[-序号]"，如 "user-auth-20260725-plan"
- dedupe_key (必填, string): 去重键，通常与 task_id 相同
- prompt (必填, string, ≥40 chars): 详细任务描述，包含仓库根、目标、需 Read 的文件、验收条件
- mode (必填, "plan" | "execute" | "verify"): 执行模式。plan=分析规划，execute=实现，verify=验证
- priority (可选, number): 优先级，默认 0，越大越优先
- acceptance_criteria (execute/verify 必填, string): 验收条件，如 "npm run check && npm test"
- read_paths (可选, string[]): 建议先 Read 的文件路径
- task_type (可选, "code_gen"|"doc_gen"|"test_gen"|"code_review"|"migration"|"i18n"|"refactor"): 任务类型
- topic (可选, string): 分类标签
- empty_run_grace_minutes (可选, number): 空跑容忍分钟数，execute 建议设 10
- model (可选, string): 覆盖默认模型
- depends_on (可选, string[]): 该任务依赖的 task_id 列表，必须先完成依赖任务才能开始本任务
- parallel_group (可选, string): 并行组标签；同一 parallel_group 的任务可同时执行，不同组或无此字段的任务按 depends_on 串行
`;

const DECOMPOSE_SYSTEM_PROMPT = `你是 agent-farm 的自动拆波（Auto-Wave Decompose）引擎。
将用户的自然语言需求拆解为 1 个 plan 任务 + 若干 execute 子任务，输出 JSON 数组。

## 拆解原则
1. **plan 任务**: 分析需求、阅读代码、输出实现清单和验收要点，不写代码
2. **execute 任务**: 每个 execute 任务聚焦一个可独立验收的子目标
3. **单一职责**: 每个 execute 任务的 prompt 只描述一个子目标，避免混杂
4. **验收明确**: 每个 execute 任务的 acceptance_criteria 必须可执行（shell 命令或明确检查点）
5. **task_type 自动标注**: 根据子任务性质标注 task_type（code_gen / test_gen / doc_gen / refactor 等）

## 依赖与并行分析（重要）
你必须分析任务间的依赖关系并标注：
1. **depends_on**: 标注每个任务依赖哪些 task_id 必须先完成。
   - plan 任务通常无依赖（depends_on 为空数组或不填）
   - 所有 execute 任务默认依赖 plan 任务（因为需要 plan 的分析结果）
   - 有先后顺序的 execute 任务间也需标注依赖
2. **parallel_group**: 标注哪些任务可以并行执行。
   - 同一 parallel_group 的任务无相互依赖，可同时执行
   - 不同 parallel_group 的任务必须串行（前一组全部完成才开始下一组）
   - 示例：如果 execute-login 和 execute-register 互不依赖，设为同一 parallel_group "impl"

## 输出格式
仅输出 JSON 数组，不含 markdown 代码块标记，不含其他文字。
数组第 1 个元素为 plan，后续为 execute。

## Wave 任务 Schema
${WAVE_TASK_SCHEMA_DOC}

## 示例

输入: "实现用户登录 + 注册模块"
输出:
[
  {
    "task_id": "user-auth-<DATE>-plan",
    "dedupe_key": "user-auth-<DATE>-plan",
    "mode": "plan",
    "priority": 2,
    "read_paths": ["src/", "package.json"],
    "depends_on": [],
    "parallel_group": "plan",
    "prompt": "仓库根：本仓库。目标：实现用户登录 + 注册模块。先 Read src/ 和 package.json 了解项目结构。输出实现清单（文件路径 + 验收要点）；不写代码。验收：npm run check 必须通过。"
  },
  {
    "task_id": "user-auth-<DATE>-execute-login",
    "dedupe_key": "user-auth-<DATE>-execute-login",
    "mode": "execute",
    "priority": 3,
    "task_type": "code_gen",
    "read_paths": ["src/"],
    "depends_on": ["user-auth-<DATE>-plan"],
    "parallel_group": "impl",
    "empty_run_grace_minutes": 10,
    "prompt": "仓库根：本仓库。目标：实现用户登录功能。先 Read 上一条 plan 产出与 src/。实现登录 API、密码验证、session/token 管理。禁止超过 10 分钟无任何 git diff；每步后 git status。验收：npm run check && npm test 全绿。",
    "acceptance_criteria": "npm run check && npm test"
  },
  {
    "task_id": "user-auth-<DATE>-execute-register",
    "dedupe_key": "user-auth-<DATE>-execute-register",
    "mode": "execute",
    "priority": 3,
    "task_type": "code_gen",
    "read_paths": ["src/"],
    "depends_on": ["user-auth-<DATE>-plan"],
    "parallel_group": "impl",
    "empty_run_grace_minutes": 10,
    "prompt": "仓库根：本仓库。目标：实现用户注册功能。先 Read 上一条 plan 产出与 src/。实现注册 API、输入校验、密码加密存储。禁止超过 10 分钟无任何 git diff；每步后 git status。验收：npm run check && npm test 全绿。",
    "acceptance_criteria": "npm run check && npm test"
  }
]`;

/**
 * 构建发给 LLM 的 decompose prompt。
 */
export function buildDecomposePrompt(requirement: string, dateStamp?: string): string {
  const stamp = dateStamp ?? defaultWaveDateStamp();
  const prompt = DECOMPOSE_SYSTEM_PROMPT.replace(/<DATE>/g, stamp);
  return `${prompt}\n\n---\n现在拆解以下需求（使用日期戳 ${stamp}）：\n${requirement}`;
}

/**
 * 从 LLM 输出中提取 JSON 数组。
 * 处理常见格式：裸 JSON 数组、markdown 代码块包裹、带前后文字。
 */
export function extractJsonArray(output: string): string {
  const trimmed = output.trim();

  // 尝试直接解析（裸 JSON 数组）
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }

  // 尝试提取 markdown 代码块 ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    const inner = fenceMatch[1].trim();
    if (inner.startsWith("[") && inner.endsWith("]")) {
      return inner;
    }
  }

  // 尝试找到第一个 [ 和最后一个 ] 之间的内容
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  throw new Error(
    `无法从 LLM 输出中提取 JSON 数组。输出末尾 500 字符:\n${trimmed.slice(-500)}`,
  );
}

export type DecomposeOptions = {
  /** Shell runner；默认 defaultShellRunner */
  shellRunner?: ShellRunner;
  /** LLM 模型；默认 claude-sonnet-5，可通过 AGENT_FARM_DECOMPOSE_MODEL 覆盖 */
  model?: string;
  /**
   * Shell 命令模板。占位符 {prompt} 和 {model} 会被替换。
   * 默认: `claude -p {prompt} --model {model} --dangerously-skip-permissions`
   */
  executorTemplate?: string;
  /** 超时毫秒；默认 180_000 (3 min) */
  timeoutMs?: number;
  /** 日期戳 YYYYMMDD；默认当天 */
  dateStamp?: string;
};

/**
 * 自然语言需求 → 经过校验的 wave JSON 数组。
 *
 * @throws 如果 LLM 调用失败、输出无法解析、或 wave 校验不通过
 */
export async function decomposeRequirement(
  requirement: string,
  options: DecomposeOptions = {},
): Promise<JsonMap[]> {
  const runShell = options.shellRunner ?? defaultShellRunner;
  const model =
    options.model ??
    process.env.AGENT_FARM_DECOMPOSE_MODEL ??
    "claude-sonnet-5";
  const timeoutMs = options.timeoutMs ?? 180_000;
  const dateStamp = options.dateStamp ?? defaultWaveDateStamp();

  const prompt = buildDecomposePrompt(requirement, dateStamp);

  const template =
    options.executorTemplate ??
    `claude -p {prompt} --model {model} --dangerously-skip-permissions`;

  const command = template
    .replace(/\{prompt\}/g, JSON.stringify(prompt))
    .replace(/\{model\}/g, model);

  const result = await runShell(command, { timeoutMs });

  if (result.exitCode !== 0) {
    throw new Error(
      `LLM decompose 失败 (exit ${result.exitCode}): ${result.output.slice(-500)}`,
    );
  }

  const jsonText = extractJsonArray(result.output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `LLM 输出不是合法 JSON: ${String(err)}\n输出末尾 500 字符:\n${jsonText.slice(-500)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("LLM 输出须为 JSON 数组");
  }

  const items = parsed as JsonMap[];

  // 校验 wave 结构
  const warnings = validateWaveArray(items, "decompose-output");
  if (warnings.length > 0) {
    // warnings 不是致命错误；校验仍通过
  }

  return items;
}
