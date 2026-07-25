import type { DecisionRecord } from "../../../domain/decision/model.js";
import type { DecisionRepository } from "../../contracts/decision-repository.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { JsonMap, TaskRecord } from "../../../domain/task.js";

export class ResolveEscalationUseCase {
  constructor(
    private readonly decisionRepo: DecisionRepository,
    private readonly taskRepo: TaskRepository,
    private readonly eventRepo: EventRepository,
    private readonly clock: IsoClock,
  ) {}

  async execute(
    escalationId: string,
    choice: string,
    reason: string,
    resetTask: boolean,
  ): Promise<{ decision: DecisionRecord }> {
    const record = await this.decisionRepo.findById(escalationId);
    if (!record) {
      throw new Error(`Escalation ${escalationId} not found`);
    }

    // 更新决策记录
    const updated = await this.decisionRepo.update(escalationId, {
      chosen: choice,
      reason: `${record.reason}\n[Resolved by human] ${reason}`,
      resolved_by: "human",
      status: "resolved",
      resolved_at: this.clock(),
    });

    // 可选: 重置关联 task
    if (resetTask) {
      await this.#resetTask(record.task_id, escalationId, choice, reason);
    }

    return { decision: updated };
  }

  async #resetTask(taskId: string, escalationId: string, choice: string, reason: string): Promise<void> {
    const now = this.clock();
    const decisionCtx = `\n\n[decision-resolved]\nEscalation ${escalationId}: chose "${choice}". ${reason}\nContinue with this decision.`;

    const mutate = (task: TaskRecord): TaskRecord => {
      const basePrompt = String(task.prompt ?? "");
      return {
        ...task,
        status: "retry",
        prompt: `${basePrompt}${decisionCtx}`,
        attempt: Number(task.attempt ?? 0) + 1,
        _decision_id: escalationId,
        _decision_resolved_at: now,
      } as TaskRecord;
    };

    if (this.taskRepo.mergeOneTask) {
      const ok = await this.taskRepo.mergeOneTask(taskId, (task) => mutate(task as TaskRecord));
      if (!ok) {
        console.warn(`[agent-farm] Failed to reset task ${taskId} after decision resolution`);
      }
    } else {
      const rows = await this.taskRepo.list();
      const idx = rows.findIndex((x) => String(x.task_id) === taskId);
      if (idx >= 0) {
        rows[idx] = mutate(rows[idx]!);
        await this.taskRepo.save(rows);
      }
    }

    await this.eventRepo.append({
      ts: now,
      event: "task_decision_resolved",
      task_id: taskId,
      escalation_id: escalationId,
      chosen: choice,
    });
  }
}
