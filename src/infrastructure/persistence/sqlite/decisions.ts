import type { DecisionRecord } from "../../../domain/decision/model.js";
import type { DecisionRepository } from "../../../application/contracts/decision-repository.js";
import { fingerprintSimilarity, fingerprintFromString } from "../../../domain/decision/fingerprint.js";
import { openDb, withBusyRetry } from "./db.js";

export class SqliteDecisionRepository implements DecisionRepository {
  constructor(private readonly dbFile: string) {}

  async save(record: DecisionRecord): Promise<void> {
    const db = openDb(this.dbFile);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO decisions(
        id, task_id, decision_id, context, context_fingerprint,
        options, chosen, reason, resolved_by, confidence,
        status, created_at, resolved_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    await withBusyRetry(db, () =>
      stmt.run(
        record.id,
        record.task_id,
        record.decision_id,
        record.context,
        record.context_fingerprint,
        JSON.stringify(record.options),
        record.chosen,
        record.reason,
        record.resolved_by,
        record.confidence,
        record.status,
        record.created_at,
        record.resolved_at ?? null,
      ),
    );
  }

  async findById(id: string): Promise<DecisionRecord | null> {
    const db = openDb(this.dbFile);
    const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.#toRecord(row);
  }

  async findByTask(taskId: string): Promise<DecisionRecord[]> {
    const db = openDb(this.dbFile);
    const rows = db.prepare("SELECT * FROM decisions WHERE task_id = ? ORDER BY created_at DESC").all(taskId) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.#toRecord(r));
  }

  async findSimilar(
    taskId: string,
    fingerprint: string,
    minSimilarity: number,
  ): Promise<Array<DecisionRecord & { _similarity: number }>> {
    const db = openDb(this.dbFile);
    const rows = db
      .prepare("SELECT * FROM decisions WHERE task_id != ? AND chosen IS NOT NULL AND status = 'resolved'")
      .all(taskId) as Array<Record<string, unknown>>;

    const fpTokens = fingerprintFromString(fingerprint);

    return rows
      .map((row) => {
        const record = this.#toRecord(row);
        const similarity = fingerprintSimilarity(fpTokens, fingerprintFromString(record.context_fingerprint));
        return { ...record, _similarity: similarity };
      })
      .filter((r) => r._similarity >= minSimilarity)
      .sort((a, b) => b._similarity - a._similarity)
      .slice(0, 5);
  }

  async listEscalated(): Promise<DecisionRecord[]> {
    const db = openDb(this.dbFile);
    const rows = db
      .prepare("SELECT * FROM decisions WHERE status = 'escalated' ORDER BY created_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.#toRecord(r));
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
      options: parseJsonArray(row.options),
      chosen: row.chosen != null ? String(row.chosen) : null,
      reason: String(row.reason ?? ""),
      resolved_by: row.resolved_by != null ? (String(row.resolved_by) as DecisionRecord["resolved_by"]) : null,
      confidence: row.confidence != null ? Number(row.confidence) : null,
      status: String(row.status ?? "pending") as DecisionRecord["status"],
      created_at: String(row.created_at ?? ""),
      resolved_at: row.resolved_at != null ? String(row.resolved_at) : undefined,
    };
  }
}

function parseJsonArray(val: unknown): string[] {
  try {
    const parsed = typeof val === "string" ? JSON.parse(val) : val;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fall through */
  }
  return [];
}
