import type { JsonMap, TaskRecord, TaskStatus } from "../../domain/task.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import type { ResolvedSelfHealingConfig } from "./config.js";
import {
  applyDegradationAction,
  isDegradationExhausted,
  nextDegradationAction,
} from "./degradation.js";

export type SelfHealingDeps = {
  /** 列出所有任务（用于 poison 扫描） */
  listTasks: () => Promise<TaskRecord[]>;
  eventRepo: EventRepository;
  clock: IsoClock;
  config: ResolvedSelfHealingConfig;
  /** 将任务批量移至 blocked（poison 隔离） */
  quarantinePoison: (maxAttempts: number) => Promise<JsonMap>;
  /** 单任务状态+字段更新 */
  updateTask: (taskId: string, status: TaskStatus, extra: JsonMap) => Promise<boolean>;
  /** 过期租约回收 */
  recoverStale: (leaseTimeoutSeconds: number) => Promise<JsonMap>;
};

export type SelfHealingResult = {
  /** 本次自愈处理的任务总数 */
  totalHealed: number;
  /** 租约回收数 */
  recoveredCount: number;
  /** 降级重试数（未 blocked，已重试） */
  degradedCount: number;
  /** 毒化隔离数（降级链耗尽，blocked） */
  quarantinedCount: number;
  /** 降级失败转为 blocked 的 task_id 列表 */
  blockedIds: string[];
};

function taskEvent(ts: string, event: string, taskId: string, extra?: JsonMap): JsonMap {
  return { ts, event, task_id: taskId, ...(extra ?? {}) };
}

/**
 * 自愈服务：自动检测并修复异常任务状态。
 *
 * 流程：
 * 1. 回收过期租约（stale → retry）
 * 2. 检测 poison 任务（attempt >= maxRetries）
 * 3. 对 poison 任务尝试降级策略（换模型 → 降级 prompt → 纯重试）
 * 4. 降级链耗尽后 → blocked（通知用户）
 * 5. 所有操作都记录事件，供 doctor 诊断
 */
export class SelfHealingService {
  constructor(private readonly deps: SelfHealingDeps) {}

  /**
   * 核心自愈循环：每次 worker tick 调用。
   * @param leaseTimeoutSeconds 租约超时（秒）
   */
  async heal(leaseTimeoutSeconds: number): Promise<SelfHealingResult> {
    let recoveredCount = 0;
    let degradedCount = 0;
    let quarantinedCount = 0;
    const blockedIds: string[] = [];

    // 1. 租约回收
    const staleResult = await this.deps.recoverStale(leaseTimeoutSeconds);
    const staleIds: string[] = (staleResult.task_ids as string[]) ?? [];
    recoveredCount = staleIds.length;

    if (staleIds.length > 0) {
      const ts = this.deps.clock();
      for (const id of staleIds) {
        await this.deps.eventRepo.append(
          taskEvent(ts, "task_self_healing_recovered", id, { stage: "lease" }),
        );
      }
    }

    // 2. 读取全量任务，检测 poison
    const tasks = await this.deps.listTasks();
    const poisonThreshold = this.deps.config.maxRetries;

    for (const task of tasks) {
      const status = String(task.status ?? "");
      const attempt = Number(task.attempt ?? 0);

      // 只处理 retry/failed 状态且达到毒化阈值的任务
      if (!["retry", "failed"].includes(status)) continue;
      if (attempt < poisonThreshold) continue;

      const taskId = String(task.task_id ?? "");
      const ts = this.deps.clock();

      // 3. 计算降级策略
      const action = nextDegradationAction(task, this.deps.config);

      if (action) {
        // 有可用降级策略 → 应用并重试
        const patch = applyDegradationAction(task, action);
        // patch 中已含 status: "retry"
        const retryStatus = String(patch.status ?? "retry") as TaskStatus;
        await this.deps.updateTask(taskId, retryStatus, patch);

        await this.deps.eventRepo.append(
          taskEvent(ts, "task_self_healing_degraded", taskId, {
            attempt,
            degradation_attempt: patch.degradation_attempt,
            action: action.type,
            model: (patch as JsonMap).model,
            stage: "self-healing",
          }),
        );

        if (action.type === "switch_model") {
          console.warn(
            `[agent-farm] self-healing: task ${taskId} switching to model ${action.model} (attempt ${attempt})`,
          );
        } else {
          console.warn(
            `[agent-farm] self-healing: task ${taskId} applying "${action.type}" (attempt ${attempt})`,
          );
        }

        degradedCount++;
      } else {
        // 降级链耗尽 → 只能 blocked（此任务会在 quarantinePoison 中被隔离）
        // 这里先记录事件，quarantinePoison 会负责隔离
        if (!isDegradationExhausted(task, this.deps.config)) continue;

        await this.deps.eventRepo.append(
          taskEvent(ts, "task_self_healing_exhausted", taskId, {
            attempt,
            degradation_attempt: task.degradation_attempt ?? 0,
            stage: "self-healing",
          }),
        );

        console.error(
          `[agent-farm] self-healing exhausted for task ${taskId}: ` +
            `all degradation strategies failed after ${attempt} attempts. Task will be blocked.`,
        );
      }
    }

    // 4. 执行 poison 隔离（将降级耗尽的 blocked 任务移入隔离区）
    const poisonResult = await this.deps.quarantinePoison(poisonThreshold);
    quarantinedCount = Number(poisonResult.quarantined_count ?? 0);
    const qIds: string[] = (poisonResult.task_ids as string[]) ?? [];
    blockedIds.push(...qIds);

    if (qIds.length > 0) {
      const ts = this.deps.clock();
      for (const id of qIds) {
        await this.deps.eventRepo.append(
          taskEvent(ts, "task_self_healing_quarantined", id, {
            stage: "self-healing",
          }),
        );
      }
    }

    return {
      totalHealed: recoveredCount + degradedCount + quarantinedCount,
      recoveredCount,
      degradedCount,
      quarantinedCount,
      blockedIds,
    };
  }
}
