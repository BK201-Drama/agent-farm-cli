import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type BetterSqlite3 from "better-sqlite3";
const require = createRequire(import.meta.url);

interface SharedRebuild {
  rebuildBetterSqlite3(packageRoot: string): boolean;
  shouldSkipRebuild(opts?: { checkRuntime?: boolean }): boolean;
}

type SqliteCtor = typeof BetterSqlite3;
type SqliteDb = InstanceType<SqliteCtor>;

const DB_CACHE = new Map<string, SqliteDb>();

export const SQLITE_BUSY = 5;
export const BUSY_RETRY_LIMIT = 3;
export const BUSY_RETRY_DELAY_MS = 100;

/** 清除连接缓存（不调用 .close()，仅移除引用）。测试中用于重置状态。 */
export function clearOpenDbCache(): void {
  DB_CACHE.clear();
}

/** 关闭并移除指定路径的数据库连接。 */
export function closeDb(dbFile: string): void {
  const db = DB_CACHE.get(dbFile);
  if (db) {
    try {
      db.close();
    } catch {
      /* 连接可能已经关闭 */
    }
    DB_CACHE.delete(dbFile);
  }
}

/** 关闭所有已缓存的数据库连接。 */
export function closeAllDbs(): void {
  for (const db of DB_CACHE.values()) {
    try {
      db.close();
    } catch {
      /* 连接可能已经关闭 */
    }
  }
  DB_CACHE.clear();
}

export async function vacuumDb(dbFile: string): Promise<void> {
  const db = openDb(dbFile);
  db.pragma("busy_timeout = 30000");
  try {
    await withBusyRetry(db, () => {
      db.exec("VACUUM");
    });
  } finally {
    db.pragma("busy_timeout = 5000");
  }
}

export function findAgentFarmPackageRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 24; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const name = (JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string }).name;
        if (name === "agent-farm-cli") return dir;
      } catch {
        /* ignore malformed package.json */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export function isLikelyNodeAbiMismatch(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /NODE_MODULE_VERSION|was compiled against a different Node\.js/i.test(msg);
}

function loadSharedRebuildModule(packageRoot: string): SharedRebuild {
  const rootRequire = createRequire(join(packageRoot, "package.json"));
  return rootRequire("./scripts/lib/rebuild-better-sqlite3.mjs") as SharedRebuild;
}

/** 供测试 mock `spawnSync`；逻辑与 `scripts/lib/rebuild-better-sqlite3.mjs` 一致。 */
export function tryRebuildBetterSqlite3(packageRoot: string): boolean {
  const r = spawnSync("npm", ["rebuild", "better-sqlite3", "--foreground-scripts"], {
    cwd: packageRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
  });
  return r.status === 0;
}

let DatabaseClass: SqliteCtor | undefined;

function loadDatabaseCtor(): SqliteCtor {
  if (DatabaseClass !== undefined) return DatabaseClass;
  try {
    DatabaseClass = require("better-sqlite3") as SqliteCtor;
    return DatabaseClass;
  } catch (err) {
    const skip =
      process.env.AGENT_FARM_SKIP_SQLITE_RUNTIME_REBUILD === "1" || process.env.AGENT_FARM_SKIP_SQLITE_REBUILD === "1";
    if (skip || !isLikelyNodeAbiMismatch(err)) {
      throw err;
    }
    const here = dirname(fileURLToPath(import.meta.url));
    const root = findAgentFarmPackageRoot(here);
    if (root === null) {
      throw err;
    }
    const { rebuildBetterSqlite3 } = loadSharedRebuildModule(root);
    console.warn(
      `[agent-farm-cli] better-sqlite3 与当前 Node 的 ABI 不一致，正在于 ${root} 执行 npm rebuild better-sqlite3 …`,
    );
    if (!rebuildBetterSqlite3(root)) {
      throw err;
    }
    try {
      const resolved = require.resolve("better-sqlite3");
      delete require.cache[resolved];
    } catch {
      /* ignore */
    }
    DatabaseClass = require("better-sqlite3") as SqliteCtor;
    return DatabaseClass;
  }
}

export function openDb(dbFile: string): SqliteDb {
  const cached = DB_CACHE.get(dbFile);
  if (cached) return cached;

  mkdirSync(dirname(dbFile), { recursive: true });
  const Database = loadDatabaseCtor();
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  ensureSchema(db);
  DB_CACHE.set(dbFile, db);
  return db;
}

export async function withBusyRetry<T>(db: SqliteDb, fn: () => T): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < BUSY_RETRY_LIMIT; attempt++) {
    try {
      return fn();
    } catch (err: unknown) {
      lastErr = err;
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "SQLITE_BUSY") {
        if (attempt < BUSY_RETRY_LIMIT - 1) {
          const sleep = BUSY_RETRY_DELAY_MS * (attempt + 1);
          await new Promise((r) => setTimeout(r, sleep));
        }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function migrateExecutionMemoryColumns(db: SqliteDb): void {
  try {
    const cols = db.pragma("table_info(execution_memory)") as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("input_tokens")) {
      db.exec("ALTER TABLE execution_memory ADD COLUMN input_tokens INTEGER");
    }
    if (!colNames.has("output_tokens")) {
      db.exec("ALTER TABLE execution_memory ADD COLUMN output_tokens INTEGER");
    }
    if (!colNames.has("cost_cents")) {
      db.exec("ALTER TABLE execution_memory ADD COLUMN cost_cents INTEGER");
    }
  } catch {
    // Table may not exist yet (first run); CREATE TABLE IF NOT EXISTS handles it above
  }
}

function ensureSchema(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_rows (
      storage_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_status ON task_rows(json_extract(payload, '$.status'));

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

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      decision_id TEXT NOT NULL,
      context TEXT NOT NULL,
      context_fingerprint TEXT NOT NULL,
      options TEXT NOT NULL,
      chosen TEXT,
      reason TEXT DEFAULT '',
      resolved_by TEXT,
      confidence REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_decisions_task_id ON decisions(task_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);

    CREATE TABLE IF NOT EXISTS execution_memory (
      task_id TEXT PRIMARY KEY,
      dedupe_key TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      exit_code INTEGER NOT NULL DEFAULT 0,
      diff_summary_json TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      task_type TEXT NOT NULL DEFAULT '',
      terminal_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_cents INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_execution_memory_dedupe ON execution_memory(dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_execution_memory_task_type ON execution_memory(task_type);
    CREATE INDEX IF NOT EXISTS idx_execution_memory_status ON execution_memory(terminal_status);
  `);

  // Migration: add token/cost columns to existing execution_memory tables
  migrateExecutionMemoryColumns(db);
}
