import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_CACHE = new Map<string, Database.Database>();

/** 测试或多库场景下释放进程内连接缓存 */
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
