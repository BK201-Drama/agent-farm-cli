import { nowIso } from "../../clock/iso-clock.js";
import type { ExecutionMemoryRecord } from "../../../domain/execution-memory/model.js";
import type { ExecutionMemoryRepository } from "../../../domain/ports/repositories.js";
import { openDb, withBusyRetry } from "./db.js";

const PROMPT_CAP = 2000;

function truncatePrompt(prompt: string): string {
  if (prompt.length <= PROMPT_CAP) return prompt;
  return prompt.slice(0, PROMPT_CAP - 20) + "\n[... truncated ...]";
}

export class SqliteExecutionMemoryRepository implements ExecutionMemoryRepository {
  constructor(private readonly dbFile: string) {}

  async insert(record: ExecutionMemoryRecord): Promise<void> {
    const db = openDb(this.dbFile);
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO execution_memory(task_id, dedupe_key, prompt, model, exit_code, diff_summary_json, duration_ms, task_type, terminal_status, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await withBusyRetry(db, () =>
      stmt.run(
        record.task_id,
        record.dedupe_key,
        truncatePrompt(record.prompt),
        record.model,
        record.exit_code,
        record.diff_summary ? JSON.stringify(record.diff_summary) : null,
        record.duration_ms,
        record.task_type,
        record.terminal_status,
        nowIso(),
      ),
    );
  }

  async listByDedupePrefix(prefix: string, limit = 20): Promise<ExecutionMemoryRecord[]> {
    const db = openDb(this.dbFile);
    const rows = db
      .prepare(
        `SELECT task_id, dedupe_key, prompt, model, exit_code, diff_summary_json, duration_ms, task_type, terminal_status, created_at
         FROM execution_memory
         WHERE dedupe_key LIKE ? AND terminal_status = 'done'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(`${prefix}%`, limit) as Array<{
      task_id: string;
      dedupe_key: string;
      prompt: string;
      model: string;
      exit_code: number;
      diff_summary_json: string | null;
      duration_ms: number;
      task_type: string;
      terminal_status: string;
      created_at: string;
    }>;
    return rows.map((row) => this.deserialize(row));
  }

  async countConsecutiveFailures(dedupePrefix: string): Promise<number> {
    const db = openDb(this.dbFile);
    const rows = db
      .prepare(
        `SELECT terminal_status FROM execution_memory
         WHERE dedupe_key LIKE ?
         ORDER BY created_at DESC
         LIMIT 20`,
      )
      .all(`${dedupePrefix}%`) as Array<{ terminal_status: string }>;
    let count = 0;
    for (const row of rows) {
      if (row.terminal_status === "failed") {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  async modelSuccessRates(): Promise<Array<{ task_type: string; model: string; total: number; success: number }>> {
    const db = openDb(this.dbFile);
    const rows = db
      .prepare(
        `SELECT task_type, model,
                COUNT(*) as total,
                SUM(CASE WHEN terminal_status = 'done' THEN 1 ELSE 0 END) as success
         FROM execution_memory
         WHERE task_type != ''
         GROUP BY task_type, model
         ORDER BY task_type, total DESC`,
      )
      .all() as Array<{ task_type: string; model: string; total: number; success: number }>;
    return rows;
  }

  async failureHotspots(topN: number): Promise<Array<{ dedupe_prefix: string; total: number; failed: number }>> {
    const db = openDb(this.dbFile);
    // Extract prefix: everything up to the last '-' segment in dedupe_key
    const rows = db
      .prepare(
        `SELECT
           CASE
             WHEN instr(dedupe_key, '-') > 0
             THEN substr(dedupe_key, 1, length(dedupe_key) - length(substr(dedupe_key, instr(dedupe_key, '-') + 1)) - 1)
             ELSE dedupe_key
           END as dedupe_prefix,
           COUNT(*) as total,
           SUM(CASE WHEN terminal_status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM execution_memory
         WHERE dedupe_key != ''
         GROUP BY dedupe_prefix
         HAVING failed > 0
         ORDER BY failed DESC
         LIMIT ?`,
      )
      .all(Math.max(1, topN)) as Array<{ dedupe_prefix: string; total: number; failed: number }>;
    return rows;
  }

  private deserialize(row: {
    task_id: string;
    dedupe_key: string;
    prompt: string;
    model: string;
    exit_code: number;
    diff_summary_json: string | null;
    duration_ms: number;
    task_type: string;
    terminal_status: string;
    created_at: string;
  }): ExecutionMemoryRecord {
    let diff_summary: ExecutionMemoryRecord["diff_summary"] = null;
    if (row.diff_summary_json) {
      try {
        diff_summary = JSON.parse(row.diff_summary_json) as ExecutionMemoryRecord["diff_summary"];
      } catch {
        diff_summary = null;
      }
    }
    return {
      task_id: row.task_id,
      dedupe_key: row.dedupe_key,
      prompt: row.prompt,
      model: row.model,
      exit_code: row.exit_code,
      diff_summary,
      duration_ms: row.duration_ms,
      task_type: row.task_type,
      terminal_status: row.terminal_status,
      created_at: row.created_at,
    };
  }
}
