import type { TaskRecord } from "../../../../../domain/task.js";
import { clipPrompt } from "./text.js";

function recordStr(t: TaskRecord, key: string): string {
  return String((t as Record<string, unknown>)[key] ?? "");
}

/** 失败/阻塞/重试等：单行摘要 */
export function failureHint(t: TaskRecord, maxLen: number): string {
  const msg = recordStr(t, "last_error").trim() || recordStr(t, "blocked_reason").trim();
  const one = msg.replace(/\s+/g, " ");
  return clipPrompt(one, maxLen);
}

/** topic + mode + task_type/model 合一格，便于窄终端 */
export function topicModeBrief(t: TaskRecord, maxLen: number): string {
  const topic = String(t.topic ?? "").replace(/\s+/g, " ").trim() || "—";
  const taskType = String((t as Record<string, unknown>).task_type ?? "").trim();
  const mode = taskType || String(t.mode ?? "").trim() || "—";
  const model = String((t as Record<string, unknown>).model ?? "").trim();
  // compact: topic/mode [model]
  const base = model ? `${topic}/${mode} [${model}]` : `${topic}/${mode}`;
  return clipPrompt(base, maxLen);
}
