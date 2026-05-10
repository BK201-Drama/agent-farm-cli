import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import {
  type AgentFarmStorageKind,
  resolveAgentFarmStorageFromEnv,
  resolveQueueWorkspace,
} from "../../../domain/task/queue-workspace-paths.js";
import { type BetterSqlite3Probe, probeBetterSqlite3 } from "../../../infrastructure/diagnostics/better-sqlite3-probe.js";
import { probeOpencodeRunFormatJson } from "../../../infrastructure/diagnostics/opencode-run-probe.js";
import { resolveGitTopLevel } from "../../../infrastructure/git/agent-farm-worktree.js";
import { print } from "../print.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { createDefaultStorageContainer } from "../compose.js";

function printBrief(
  report: Record<string, unknown>,
  sqliteProbe: BetterSqlite3Probe,
  queueStorage: AgentFarmStorageKind,
): void {
  const lines: string[] = [];
  const dedupeCount = (report.duplicate_dedupe_keys_count as number) ?? 0;
  const dd = report.duplicate_dedupe_keys as Array<{ dedupe_key: string; task_ids: string[] }> | undefined;
  if (dedupeCount > 0) {
    lines.push(`⚠ DEDUPE_KEY COLLISION: ${dedupeCount} dedupe key(s) have multiple active tasks`);
  }
  lines.push(`tasks: ${report.tasks_total ?? 0} total, ${report.quarantine_total ?? 0} quarantined`);
  lines.push(`stale running: ${report.stale_running_count ?? 0}`);
  lines.push(`review overdue: ${report.review_overdue_count ?? 0}`);
  lines.push(`heartbeat missing (no claim): ${report.heartbeat_missing_count ?? 0}`);
  const hm = report.heartbeat_missing as Array<{ task_id: string; heartbeat_at: string }> | undefined;
  if (hm && hm.length > 0) {
    for (const h of hm.slice(0, 5)) {
      lines.push(`  [${h.task_id}] heartbeat_at=${h.heartbeat_at}`);
    }
  }
  lines.push(`orphan worktrees: ${report.orphan_worktrees_count ?? 0}`);
  const ow = report.orphan_worktrees as Array<{ worktree_id: string; path: string }> | undefined;
  if (ow && ow.length > 0) {
    for (const o of ow.slice(0, 5)) {
      lines.push(`  [${o.worktree_id}] path=${o.path}`);
    }
  }
  if (dd && dd.length > 0) {
    lines.push(`dedupe key collisions (${dedupeCount}):`);
    for (const d of dd.slice(0, 5)) {
      lines.push(`  key="${d.dedupe_key}" task_ids=[${d.task_ids.join(", ")}]`);
    }
  } else {
    lines.push(`dedupe key collisions: 0`);
  }
  const hotspots = report.failure_hotspots as Array<{ reason: string; count: number }> | undefined;
  if (hotspots && hotspots.length > 0) {
    lines.push(`top failures:`);
    for (const h of hotspots.slice(0, 5)) {
      lines.push(`  [${h.count}] ${h.reason.slice(0, 80)}${h.reason.length > 80 ? "…" : ""}`);
    }
  }
  const healTasks = report.tasks_with_opencode_heal_prompt;
  if (typeof healTasks === "number" && healTasks > 0) {
    lines.push(`tasks with [opencode-heal] in prompt: ${healTasks}`);
  }
  const dcount = report.opencode_stream_diag_recent_count;
  if (typeof dcount === "number" && dcount > 0) {
    lines.push(`opencode stream diag events (recent window): ${dcount}`);
  }
  const op = report.opencode_cli as { ok?: boolean; has_format_json?: boolean; message?: string } | undefined;
  if (op) {
    lines.push(
      op.ok && op.has_format_json
        ? `opencode-ai run: --format json available`
        : `opencode-ai probe: ${op.message ?? "unknown"}`,
    );
  }
  if (queueStorage === "jsonl") {
    lines.push(`queue storage: jsonl (better-sqlite3 与队列无关；探针已跳过)`);
  } else if (sqliteProbe.ok) {
    lines.push(`sqlite: ok`);
  } else {
    lines.push(`sqlite: FAIL - ${sqliteProbe.hint ?? "unknown error"}`);
    if (/better[_-]sqlite3|NODE_MODULE_VERSION/i.test(sqliteProbe.hint ?? "")) {
      lines.push(
        `  当前 Node 与 better-sqlite3 ABI 不匹配（常见于切换 nvm 版本后）。建议：npm rebuild better-sqlite3 或 AGENT_FARM_STORAGE=jsonl`,
      );
    }
  }
  process.stderr.write(`${lines.join("\n")}\n`);
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .option("--review-overdue-hours <n>", "review overdue threshold", "2")
    .option("--top-n <n>", "top failures", "5")
    .option("--output-file <path>", "write json report to file", "")
    .option("--brief", "print human-readable summary to stderr instead of JSON")
    .action(async (opts) => {
      const w = resolveQueueWorkspace(process.cwd());
      const sqliteProbe =
        resolveAgentFarmStorageFromEnv() === "sqlite" ? probeBetterSqlite3() : ({ ok: true as const } as const);
      const opencodeProbe = probeOpencodeRunFormatJson(w.cwd);
      const gitTop = resolveGitTopLevel(w.cwd);
      const worktreeBasePath = gitTop ? join(gitTop, ".agent-farm", "worktrees") : undefined;
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
          Number(opts.topN),
          worktreeBasePath,
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
        opencode_cli: opencodeProbe,
      };
      if (opts.brief) {
        printBrief(merged, sqliteProbe, w.storage);
        return;
      }
      if (String(opts.outputFile)) {
        await writeFile(String(opts.outputFile), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      }
      print(merged);
    });
}
