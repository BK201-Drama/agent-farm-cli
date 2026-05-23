import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vacuumDb, openDb, clearOpenDbCache } from "../../src/infrastructure/persistence/sqlite/db.js";

describe("vacuumDb", () => {
  let dir = "";

  afterEach(() => {
    clearOpenDbCache();
    if (!dir) return;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    dir = "";
  });

  function freshDb(): { dbFile: string } {
    dir = join(tmpdir(), `agent-farm-vacuum-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const dbFile = join(dir, "t.db");
    mkdirSync(dir, { recursive: true });
    const db = openDb(dbFile);
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL
      );
    `);
    return { dbFile };
  }

  it("runs VACUUM successfully on a fresh database", () => {
    const { dbFile } = freshDb();
    vacuumDb(dbFile);
  });

  it("runs VACUUM after insert and delete cycle (reclaims space)", () => {
    const { dbFile } = freshDb();
    const db = openDb(dbFile);

    const insertStmt = db.prepare("INSERT INTO test_data (payload) VALUES (?)");
    for (let i = 0; i < 1000; i++) {
      insertStmt.run(`row ${i} - ${"x".repeat(200)}`);
    }

    const sizeBefore = db.pragma("page_count", { simple: true }) as number;
    expect(sizeBefore).toBeGreaterThan(0);

    db.exec("DELETE FROM test_data WHERE id % 2 = 0");

    vacuumDb(dbFile);

    const sizeAfter = db.pragma("page_count", { simple: true }) as number;
    expect(sizeAfter).toBeLessThanOrEqual(sizeBefore);
  });

  it("creates and vacuums a new database when file does not exist yet", () => {
    dir = join(tmpdir(), `agent-farm-vacuum-new-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const dbFile = join(dir, "new.db");
    vacuumDb(dbFile);
  });

  it("throws for a directory path instead of db file", () => {
    dir = join(tmpdir(), `agent-farm-vacuum-dir-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    expect(() => vacuumDb(dir)).toThrow();
  });
});

describe("vacuumDb busy retry", () => {
  let dir = "";

  afterEach(() => {
    clearOpenDbCache();
    if (!dir) return;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    dir = "";
  });

  function createVacuumDb(): string {
    dir = join(tmpdir(), `agent-farm-vacuum-busy-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const dbFile = join(dir, "t.db");
    mkdirSync(dir, { recursive: true });
    const db = openDb(dbFile);
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL
      );
    `);
    const insertStmt = db.prepare("INSERT INTO test_data (payload) VALUES (?)");
    for (let i = 0; i < 100; i++) {
      insertStmt.run(`row ${i}`);
    }
    return dbFile;
  }

  it("retries on SQLITE_BUSY if lock is released quickly", () => {
    const dbFile = createVacuumDb();

    const db = openDb(dbFile);
    db.pragma("busy_timeout = 500");

    const execSpy = vi.spyOn(db, "exec").mockImplementationOnce(function (this: typeof db, sql: string) {
      const err = new Error("SQLITE_BUSY: database is locked") as Error & { code: string };
      err.code = "SQLITE_BUSY";
      throw err;
    });

    try {
      vacuumDb(dbFile);
      expect(execSpy).toHaveBeenCalledTimes(2);
    } finally {
      execSpy.mockRestore();
    }
  });
});
