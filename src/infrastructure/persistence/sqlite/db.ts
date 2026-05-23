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

export function vacuumDb(dbFile: string): void {
  const db = openDb(dbFile);
  db.pragma("busy_timeout = 30000");
  try {
    withBusyRetry(db, () => {
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

export function withBusyRetry<T>(db: SqliteDb, fn: () => T): T {
  let lastErr: unknown;
  for (let attempt = 0; attempt < BUSY_RETRY_LIMIT; attempt++) {
    try {
      return fn();
    } catch (err: unknown) {
      lastErr = err;
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "SQLITE_BUSY") {
        if (attempt < BUSY_RETRY_LIMIT - 1) {
          const sleep = BUSY_RETRY_DELAY_MS * (attempt + 1);
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          setTimeout(() => {}, sleep).unref?.();
          const start = Date.now();
          while (Date.now() - start < sleep) {
            // busy-wait for SQLITE_BUSY retry delay
          }
        }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function ensureSchema(db: SqliteDb): void {
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
