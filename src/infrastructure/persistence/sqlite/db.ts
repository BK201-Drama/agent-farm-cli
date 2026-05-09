import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_CACHE = new Map<string, Database.Database>();

export const SQLITE_BUSY = 5;
export const BUSY_RETRY_LIMIT = 3;
export const BUSY_RETRY_DELAY_MS = 100;

export function clearOpenDbCache(): void {
  DB_CACHE.clear();
}

export function openDb(dbFile: string): Database.Database {
  const cached = DB_CACHE.get(dbFile);
  if (cached) return cached;

  mkdirSync(dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  ensureSchema(db);
  DB_CACHE.set(dbFile, db);
  return db;
}

export function withBusyRetry<T>(db: Database.Database, fn: () => T): T {
  let lastErr: unknown;
  for (let attempt = 0; attempt < BUSY_RETRY_LIMIT; attempt++) {
    try {
      return fn();
    } catch (err: unknown) {
      lastErr = err;
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "SQLITE_BUSY") {
        if (attempt < BUSY_RETRY_LIMIT - 1) {
          const sleep = BUSY_RETRY_DELAY_MS * (attempt + 1);
          setTimeout(() => {}, sleep).unref?.();
          const start = Date.now();
          while (Date.now() - start < sleep) {}
        }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_rows (
      storage_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quarantine_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
