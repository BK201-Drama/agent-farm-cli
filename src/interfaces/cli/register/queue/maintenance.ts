import { existsSync } from "node:fs";
import type { Command } from "commander";
import { resolveAgentFarmStorageFromEnv } from "../../../../domain/task/queue-workspace-paths.js";
import { vacuumDb } from "../../../../infrastructure/persistence/sqlite/db.js";
import { DEFAULT_DB_FILE, DEFAULT_QUARANTINE_FILE, DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueMaintenanceCommands(queue: Command): void {
  queue
    .command("recover-stale")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .action(async (opts) => {
      const container = queueCliContainer({ taskFile: String(opts.taskFile) });
      print(await container.queueService.recoverStale(Number(opts.leaseTimeoutSeconds)));
    });

  queue
    .command("quarantine-poison")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--max-attempts <n>", "poison threshold attempts", "3")
    .action(async (opts) => {
      const container = queueCliContainer({
        taskFile: String(opts.taskFile),
        quarantineFile: String(opts.quarantineFile),
      });
      print(await container.queueService.quarantinePoison(Number(opts.maxAttempts)));
    });

  queue
    .command("vacuum")
    .description("VACUUM the SQLite queue database to reclaim disk space")
    .option("--db-file <path>", "sqlite database path", DEFAULT_DB_FILE)
    .action(async (opts) => {
      const storage = resolveAgentFarmStorageFromEnv();
      if (storage !== "sqlite") {
        throw new Error(
          `VACUUM is only available for sqlite storage. Current AGENT_FARM_STORAGE is "${storage}". Set AGENT_FARM_STORAGE=sqlite to proceed.`,
        );
      }
      const dbFile = String(opts.dbFile);
      if (!existsSync(dbFile)) {
        throw new Error(`Database file not found: ${dbFile}`);
      }
      try {
        vacuumDb(dbFile);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const hint = /SQLITE_BUSY|database is locked/i.test(msg)
          ? " The database is busy. Retry when no other processes are using it."
          : "";
        throw new Error(`VACUUM failed: ${msg}.${hint}`, { cause: err });
      }
      print({ status: "ok", dbFile, operation: "vacuum" });
    });
}
