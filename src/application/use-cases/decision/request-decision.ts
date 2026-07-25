import type { DecisionEnginePort, DecisionRecord, DecisionRequest, DecisionResult } from "../../../domain/decision/model.js";
import type { DecisionRepository } from "../../contracts/decision-repository.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import { fingerprintContext, fingerprintToString } from "../../../domain/decision/fingerprint.js";
import type { JsonMap, TaskRecord } from "../../../domain/task.js";

export class RequestDecisionUseCase {
  constructor(
    private readonly engine: DecisionEnginePort,
    private readonly decisionRepo: DecisionRepository,
    private readonly taskRepo: TaskRepository,
    private readonly eventRepo: EventRepository,
    private readonly clock: IsoClock,
  ) {}

  async execute(request: DecisionRequest): Promise<DecisionResult> {
    const result = await this.engine.evaluate(request);

    // 持久化审计记录
    const fp = fingerprintToString(fingerprintContext(request.context, request.options));
    const record: DecisionRecord = {
      id: result.escalated ? result.escalation_id : result.decision_id,
      task_id: request.task_id,
      decision_id: request.decision_id,
      context: request.context,
      context_fingerprint: fp,
      options: request.options,
      chosen: result.escalated ? null : (result as { chosen: string }).chosen,
      reason: result.reason,
      resolved_by: result.escalated ? null : (result as { resolved_by: "rule" | "history" | "llm" }).resolved_by,
      confidence: result.escalated ? null : (result as { confidence: number }).confidence,
      status: result.escalated ? "escalated" : "resolved",
      created_at: this.clock(),
    };
    await this.decisionRepo.save(record);

    // 如果升级: 转换 task 状态 running → awaiting_decision
    if (result.escalated) {
      await this.#transitionToAwaitingDecision(request.task_id, result.escalation_id, request.context, request.options);
    }

    return result;
  }

  async #transitionToAwaitingDecision(
    taskId: string,
    escalationId: string,
    context: string,
    options: string[],
  ): Promise<void> {
    const now = this.clock();
    const extra: JsonMap = {
      _escalation_id: escalationId,
      _decision_context: context,
      _decision_options: JSON.stringify(options),
    };

    // 使用 mergeOneTask 做原子更新
    if (this.taskRepo.mergeOneTask) {
      const ok = await this.taskRepo.mergeOneTask(taskId, (task) => ({
        ...task,
        status: "awaiting_decision",
        ...extra,
        _decision_at: now,
      } as TaskRecord));
      if (!ok) {
        // task 可能已经被删除或状态变更，仍然记录事件
        console.warn(`[agent-farm] Failed to transition task ${taskId} to awaiting_decision`);
      }
    } else {
      // fallback: 全量读写
      const rows = await this.taskRepo.list();
      const idx = rows.findIndex((x) => String(x.task_id) === taskId);
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...extra, status: "awaiting_decision", _decision_at: now } as TaskRecord;
        await this.taskRepo.save(rows);
      }
    }

    await this.eventRepo.append({
      ts: now,
      event: "task_awaiting_decision",
      task_id: taskId,
      escalation_id: escalationId,
    });
  }
}
