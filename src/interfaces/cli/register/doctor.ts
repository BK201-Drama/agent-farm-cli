import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { resolveAgentFarmStorageFromEnv, resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import { probeBetterSqlite3 } from "../../../infrastructure/diagnostics/better-sqlite3-probe.js";
import { print } from "../print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { createDefaultStorageContainer } from "../compose.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .option("--review-overdue-hours <n>", "review overdue threshold", "2")
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .action(async (opts) => {
      const w = resolveQueueWorkspace(process.cwd());
      const sqliteProbe =
        resolveAgentFarmStorageFromEnv() === "sqlite" ? probeBetterSqlite3() : ({ ok: true as const } as const);
      let report: Record<string, unknown>;
      try {
        const container = createDefaultStorageContainer({
          taskFile: String(opts.taskFile),
          eventFile: DEFAULT_EVENT_FILE,
          quarantineFile: String(opts.quarantineFile),
        });
        report = (await container.doctorService.build(
          Number(opts.leaseTimeoutSeconds),
          Number(opts.reviewOverdueHours),
          Number(opts.topN)
        )) as Record<string, unknown>;
      } catch (e) {
        report = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
      const merged = {
        ...report,
        queue_workspace: w,
        better_sqlite3: sqliteProbe,
      };
      if (String(opts.outputFile)) {
        await writeFile(String(opts.outputFile), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      }
      print(merged);
    });
}
