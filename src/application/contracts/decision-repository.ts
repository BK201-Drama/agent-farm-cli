import type { DecisionRecord } from "../../domain/decision/model.js";

/** 决策持久化端口 */
export interface DecisionRepository {
  save(record: DecisionRecord): Promise<void>;
  findById(id: string): Promise<DecisionRecord | null>;
  findByTask(taskId: string): Promise<DecisionRecord[]>;
  /**
   * 指纹相似度搜索。
   * @param taskId 排除当前 task（不和自己比）
   * @param fingerprint 空格分隔的 token 串
   * @param minSimilarity 最小 Jaccard 相似度（0-1）
   * @returns 相似记录列表，附 _similarity 字段，按相似度降序
   */
  findSimilar(
    taskId: string,
    fingerprint: string,
    minSimilarity: number,
  ): Promise<Array<DecisionRecord & { _similarity: number }>>;
  /** 列出所有 escalated 状态的决策 */
  listEscalated(): Promise<DecisionRecord[]>;
  /** 部分更新决策记录 */
  update(id: string, patch: Partial<DecisionRecord>): Promise<DecisionRecord>;
}
