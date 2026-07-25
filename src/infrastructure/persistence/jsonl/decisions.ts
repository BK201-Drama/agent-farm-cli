import type { DecisionRecord } from "../../../domain/decision/model.js";
import type { DecisionRepository } from "../../../application/contracts/decision-repository.js";
import { fingerprintSimilarity, fingerprintFromString } from "../../../domain/decision/fingerprint.js";
import { readJsonl, writeJsonl } from "./jsonl-utils.js";

export class JsonlDecisionRepository implements DecisionRepository {
  constructor(private readonly decisionsFile: string) {}

  async save(record: DecisionRecord): Promise<void> {
    const rows = await readJsonl(this.decisionsFile);
    const idx = rows.findIndex((r) => String(r.id ?? "") === record.id);
    const normalized = this.#serialize(record);
    if (idx >= 0) {
      rows[idx] = normalized;
    } else {
      rows.push(normalized);
    }
    await writeJsonl(this.decisionsFile, rows);
  }

  async findById(id: string): Promise<DecisionRecord | null> {
    const rows = await readJsonl(this.decisionsFile);
    const found = rows.find((r) => String(r.id ?? "") === id);
    return found ? this.#toRecord(found) : null;
  }

  async findByTask(taskId: string): Promise<DecisionRecord[]> {
    const rows = await readJsonl(this.decisionsFile);
    return rows
      .filter((r) => String(r.task_id ?? "") === taskId)
      .map((r) => this.#toRecord(r))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async findSimilar(
    taskId: string,
    fingerprint: string,
    minSimilarity: number,
  ): Promise<Array<DecisionRecord & { _similarity: number }>> {
    const rows = await readJsonl(this.decisionsFile);
    const fpTokens = fingerprintFromString(fingerprint);

    return rows
      .filter((r) => String(r.task_id ?? "") !== taskId && r.chosen != null && r.status === "resolved")
      .map((r) => {
        const record = this.#toRecord(r);
        const similarity = fingerprintSimilarity(fpTokens, fingerprintFromString(record.context_fingerprint));
        return { ...record, _similarity: similarity };
      })
      .filter((r) => r._similarity >= minSimilarity)
      .sort((a, b) => b._similarity - a._similarity)
      .slice(0, 5);
  }

  async listEscalated(): Promise<DecisionRecord[]> {
    const rows = await readJsonl(this.decisionsFile);
    return rows
      .filter((r) => r.status === "escalated")
      .map((r) => this.#toRecord(r))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async update(id: string, patch: Partial<DecisionRecord>): Promise<DecisionRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Decision ${id} not found`);
    }
    const updated: DecisionRecord = { ...existing, ...patch };
    await this.save(updated);
    return updated;
  }

  #toRecord(row: Record<string, unknown>): DecisionRecord {
    return {
      id: String(row.id ?? ""),
      task_id: String(row.task_id ?? ""),
      decision_id: String(row.decision_id ?? ""),
      context: String(row.context ?? ""),
      context_fingerprint: String(row.context_fingerprint ?? ""),
      options: Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [],
      chosen: row.chosen != null ? String(row.chosen) : null,
      reason: String(row.reason ?? ""),
      resolved_by: row.resolved_by != null ? (String(row.resolved_by) as DecisionRecord["resolved_by"]) : null,
      confidence: row.confidence != null ? Number(row.confidence) : null,
      status: (String(row.status ?? "pending")) as DecisionRecord["status"],
      created_at: String(row.created_at ?? ""),
      resolved_at: row.resolved_at != null ? String(row.resolved_at) : undefined,
    };
  }

  #serialize(record: DecisionRecord): Record<string, unknown> {
    return {
      id: record.id,
      task_id: record.task_id,
      decision_id: record.decision_id,
      context: record.context,
      context_fingerprint: record.context_fingerprint,
      options: record.options,
      chosen: record.chosen,
      reason: record.reason,
      resolved_by: record.resolved_by,
      confidence: record.confidence,
      status: record.status,
      created_at: record.created_at,
      resolved_at: record.resolved_at ?? null,
    };
  }
}
