import type { DecisionRecord } from "../../../domain/decision/model.js";
import type { DecisionRepository } from "../../contracts/decision-repository.js";

export class ListDecisionsUseCase {
  constructor(private readonly decisionRepo: DecisionRepository) {}

  /** 列出所有升级待决的决策 */
  async listEscalated(): Promise<DecisionRecord[]> {
    return this.decisionRepo.listEscalated();
  }

  /** 按 task 查询决策历史 */
  async findByTask(taskId: string): Promise<DecisionRecord[]> {
    return this.decisionRepo.findByTask(taskId);
  }
}
