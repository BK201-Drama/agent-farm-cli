import type { JsonMap, TaskRecord } from "../../../domain/task.js";
import { assertNoDuplicateDedupeKey, normalizeQueuedTask } from "../../../domain/task/enqueue.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { ExecutionMemoryRepository, TaskRepository } from "../../../domain/ports/repositories.js";

export interface AddTaskOptions {
  /** 同 wave 前缀，用于上下文注入和失败模式检测 */
  wavePrefix?: string;
  /** 连续失败阈值（达到此次数时警告），默认 3 */
  failPatternWarnThreshold?: number;
}

function extractWavePrefix(dedupeKey: string): string {
  // dedupe_key 格式如 "my-wave-20260725-plan"，前缀是去掉最后一个 `-xxx`
  const lastDash = dedupeKey.lastIndexOf("-");
  if (lastDash <= 0) return dedupeKey;
  return dedupeKey.slice(0, lastDash);
}

function formatDiffInjection(records: Array<{ task_id: string; diff_summary: unknown }>): string {
  if (records.length === 0) return "";
  const parts: string[] = [];
  parts.push("\n\n[execution-context] 同 wave 已完成任务的 diff 摘要（上下文参考）：");
  for (const r of records) {
    const ds = r.diff_summary as { files: string[]; lines_added: number; lines_removed: number } | null;
    if (!ds || ds.files.length === 0) continue;
    const fileList = ds.files.slice(0, 10).join(", ");
    const more = ds.files.length > 10 ? ` ... 等 ${ds.files.length} 个文件` : "";
    parts.push(
      `- [${r.task_id}] ${fileList}${more} | +${ds.lines_added} -${ds.lines_removed}`,
    );
  }
  return parts.length > 1 ? parts.join("\n") : "";
}

export class AddTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock,
    private readonly executionMemoryRepo?: ExecutionMemoryRepository,
  ) {}

  async execute(task: JsonMap, opts?: AddTaskOptions): Promise<TaskRecord> {
    const wavePrefix = opts?.wavePrefix ?? extractWavePrefix(String(task.dedupe_key ?? ""));
    const failThreshold = opts?.failPatternWarnThreshold ?? 3;

    // ── Failure pattern detection ──
    if (this.executionMemoryRepo && wavePrefix) {
      try {
        const consecutive = await this.executionMemoryRepo.countConsecutiveFailures(wavePrefix);
        if (consecutive >= failThreshold) {
          console.error(
            `[agent-farm] ⚠ 失败模式警告：dedupe 前缀 "${wavePrefix}" 最近 ${consecutive} 次连续失败，` +
              `即将入队任务 ${String(task.task_id ?? "")}。建议检查失败原因后再继续。`,
          );
        }
      } catch {
        // 非关键路径，静默降级
      }
    }

    // ── Wave context injection ──
    let enriched = { ...task };
    if (this.executionMemoryRepo && wavePrefix) {
      try {
        const completed = await this.executionMemoryRepo.listByDedupePrefix(wavePrefix, 10);
        if (completed.length > 0) {
          const injection = formatDiffInjection(completed);
          if (injection) {
            const prevPrompt = String(enriched.prompt ?? "");
            enriched = { ...enriched, prompt: prevPrompt + injection };
          }
        }
      } catch {
        // 非关键路径，静默降级
      }
    }

    const normalized = normalizeQueuedTask(enriched, this.clock());
    if (this.taskRepo.insertTask) {
      const dedupeKey = String(normalized.dedupe_key ?? "").trim();
      if (dedupeKey) {
        const dup = await this.taskRepo.hasActiveDuplicateDedupeKey(dedupeKey, String(normalized.task_id ?? ""));
        if (dup) {
          throw new Error(`duplicate dedupe_key in active queue: ${dedupeKey}`);
        }
      }
      await this.taskRepo.insertTask(normalized);
      return normalized;
    }
    const rows = await this.taskRepo.list();
    assertNoDuplicateDedupeKey(rows, String(normalized.dedupe_key ?? ""));
    rows.push(normalized);
    await this.taskRepo.save(rows);
    return normalized;
  }
}
