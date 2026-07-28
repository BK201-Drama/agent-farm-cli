import { join } from "node:path";
import {
  type AgentFarmStorageKind,
  resolveAgentFarmStorageFromEnv,
  resolveQueueWorkspace,
} from "../../../domain/task/queue-workspace-paths.js";
import {
  type BetterSqlite3Probe,
  probeBetterSqlite3,
} from "../../../infrastructure/diagnostics/better-sqlite3-probe.js";
import { probeOpencodeRunFormatJson } from "../../../infrastructure/diagnostics/opencode-run-probe.js";
import { resolveGitTopLevel } from "../../../infrastructure/git/agent-farm-worktree.js";
import { formatBriefFailureReasonLines, writeCliBriefToStderr } from "../brief-stderr.js";
import { print, writePrettyJsonReportIfPath } from "../print.js";
import { collectDoctorCiFailReasons } from "../doctor-ci-guards.js";
import { createCliQueueContainer } from "../default-queue-container.js";
import { acceptanceProgressPath, readProgress } from "../../../application/acceptance/progress-store.js";
import { getAcceptanceStatus } from "../../../application/acceptance/status.js";
import { acceptanceTaskKeyPrefix } from "../../../application/acceptance/acceptance-task-key.js";

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
  lines.push(
    ...formatBriefFailureReasonLines(
      report.failure_hotspots as Array<{ reason: string; count: number }> | undefined,
      "top failures:",
    ),
  );
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

  // 自愈诊断
  const sh = report.self_healing as Record<string, unknown> | undefined;
  if (sh) {
    const recovered = (sh.recovered_count as number) ?? 0;
    const degraded = (sh.degraded_count as number) ?? 0;
    const quarantined = (sh.quarantined_count as number) ?? 0;
    const exhausted = (sh.exhausted_count as number) ?? 0;
    const erRetried = (sh.empty_run_retried_count as number) ?? 0;
    const erFailed = (sh.empty_run_failed_count as number) ?? 0;
    const total = recovered + degraded + quarantined;

    if (total > 0 || erRetried > 0 || erFailed > 0) {
      lines.push(`self-healing: ${total} actions (recovered=${recovered}, degraded=${degraded}, quarantined=${quarantined}, exhausted=${exhausted})`);
      if (erRetried > 0) lines.push(`  empty-run retried: ${erRetried}`);
      if (erFailed > 0) lines.push(`  empty-run failed (exhausted): ${erFailed}`);

      const recent = (sh.recent as Array<{ task_id: string; action: string }> | undefined);
      if (recent && recent.length > 0) {
        lines.push(`  recent self-healing actions:`);
        for (const r of recent.slice(0, 5)) {
          lines.push(`    [${r.task_id}] ${r.action}`);
        }
      }
    } else {
      lines.push(`self-healing: idle (no recent actions)`);
    }
  }

  writeCliBriefToStderr(lines);
}

/** Commander `doctor` 子命令解析后的选项（字段名与 camelCase 一致）。 */
export type DoctorCliOpts = {
  taskFile: string;
  quarantineFile: string;
  leaseTimeoutSeconds: string;
  reviewOverdueHours: string;
  topN: string;
  outputFile: string;
  brief: boolean;
  /** 与 `--brief` 互斥；打印 JSON 后若有健康问题则 `process.exit(1)`。 */
  ciExit: boolean;
  /** 可选：检查指定 POC 的验收状态，未完成则 --ci-exit 失败 */
  acceptancePoc?: string;
};

export async function runDoctorCli(opts: DoctorCliOpts): Promise<void> {
  if (opts.ciExit && opts.brief) {
    throw new Error("doctor: --ci-exit cannot be used with --brief (need full JSON path for diagnostics)");
  }
  const w = resolveQueueWorkspace(process.cwd());
  const sqliteProbe =
    resolveAgentFarmStorageFromEnv() === "sqlite" ? probeBetterSqlite3() : ({ ok: true as const } as const);
  const opencodeProbe = probeOpencodeRunFormatJson(w.cwd);
  const gitTop = resolveGitTopLevel(w.cwd);
  const worktreeBasePath = gitTop ? join(gitTop, ".agent-farm", "worktrees") : undefined;
  let report: Record<string, unknown>;
  try {
    const container = await createCliQueueContainer({
      taskFile: String(opts.taskFile),
      quarantineFile: String(opts.quarantineFile),
    });
    report = (await container.doctorService.build(
      Number(opts.leaseTimeoutSeconds),
      Number(opts.reviewOverdueHours),
      Number(opts.topN),
      gitTop,
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
  await writePrettyJsonReportIfPath(opts.outputFile, merged);
  print(merged);
  if (opts.ciExit) {
    const reasons = collectDoctorCiFailReasons(merged, sqliteProbe, w.storage);

    // --acceptance-poc: 检查验收状态，未完成时追加 CI 失败原因
    if (opts.acceptancePoc) {
      const farmRoot = process.cwd();
      const progressPath = acceptanceProgressPath(farmRoot, opts.acceptancePoc);
      const progress = await readProgress(progressPath);
      if (!progress) {
        reasons.push(
          `acceptance POC "${opts.acceptancePoc}": progress file missing at ${progressPath}`,
        );
      } else {
        // 收集 acceptance__{pocId}__* 任务的状态
        const acContainer = await createCliQueueContainer({
          taskFile: String(opts.taskFile),
          quarantineFile: String(opts.quarantineFile),
        });
        const allTasks = await acContainer.queueService.listTasks();
        const taskStatuses = new Map<string, string>();
        const prefix = acceptanceTaskKeyPrefix(opts.acceptancePoc);
        for (const task of allTasks) {
          const dk = task.dedupe_key;
          if (dk && String(dk).startsWith(prefix)) {
            taskStatuses.set(String(dk), String(task.status ?? "queued"));
          }
        }
        const status = getAcceptanceStatus({ progress, taskStatuses });
        if (!status.done) {
          reasons.push(
            `acceptance POC "${opts.acceptancePoc}" is NOT DONE (demo=${status.progress.demo})`,
          );
        }
      }
    }

    if (reasons.length > 0) {
      for (const r of reasons) {
        process.stderr.write(`[agent-farm doctor --ci-exit] ${r}\n`);
      }
      process.exit(1);
    }
  }
}
