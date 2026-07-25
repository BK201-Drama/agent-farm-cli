import type { DecisionEnginePort, DecisionRecord, DecisionRequest, DecisionResult } from "../../domain/decision/model.js";
import type { DecisionRepository } from "../contracts/decision-repository.js";
import type { TaskRepository } from "../../domain/ports/repositories.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import type { JsonMap } from "../../domain/task.js";
import { RequestDecisionUseCase } from "../use-cases/decision/request-decision.js";
import { ResolveEscalationUseCase } from "../use-cases/decision/resolve-escalation.js";
import { ListDecisionsUseCase } from "../use-cases/decision/list-decisions.js";

export class DecisionService {
  private readonly requestDecisionUseCase: RequestDecisionUseCase;
  private readonly resolveEscalationUseCase: ResolveEscalationUseCase;
  private readonly listDecisionsUseCase: ListDecisionsUseCase;

  constructor(
    engine: DecisionEnginePort,
    decisionRepo: DecisionRepository,
    taskRepo: TaskRepository,
    eventRepo: EventRepository,
    clock: IsoClock,
  ) {
    this.requestDecisionUseCase = new RequestDecisionUseCase(engine, decisionRepo, taskRepo, eventRepo, clock);
    this.resolveEscalationUseCase = new ResolveEscalationUseCase(decisionRepo, taskRepo, eventRepo, clock);
    this.listDecisionsUseCase = new ListDecisionsUseCase(decisionRepo);
  }

  async requestDecision(request: DecisionRequest): Promise<DecisionResult> {
    return this.requestDecisionUseCase.execute(request);
  }

  async resolveEscalation(
    escalationId: string,
    choice: string,
    reason: string,
    resetTask: boolean,
  ): Promise<JsonMap> {
    const result = await this.resolveEscalationUseCase.execute(escalationId, choice, reason, resetTask);
    return {
      ok: true,
      escalation_id: escalationId,
      chosen: choice,
      decision: result.decision,
    };
  }

  async listEscalations(taskId?: string): Promise<DecisionRecord[]> {
    if (taskId) {
      return this.listDecisionsUseCase.findByTask(taskId);
    }
    return this.listDecisionsUseCase.listEscalated();
  }
}
