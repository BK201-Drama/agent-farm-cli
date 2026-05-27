import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { buildStuckReport, formatStuckBrief } from "../../../application/facades/stuck-report.js";
import { resolveGitTopLevel } from "../../../infrastructure/git/agent-farm-worktree.js";
import { DEFAULT_QUARANTINE_FILE, DEFAULT_TASK_FILE } from "../defaults.js";
import { print } from "../print.js";
import { createCliQueueContainer } from "../default-queue-container.js";

export function registerStuckCommands(program: Command): void {
  const stuck = program.command("stuck").description("卡住任务中心：诊断与一键恢复");

  stuck
    .command("list")
    .description("列出需介入项（聚合 doctor 信号）")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .option("--review-overdue-hours <n>", "review overdue threshold", "2")
    .option("--top-n <n>", "top failures", "5")
    .option("--brief", "human-readable summary to stderr")
    .action(async (opts) => {
      const container = await createCliQueueContainer({
        taskFile: String(opts.taskFile),
        quarantineFile: String(opts.quarantineFile),
      });
      const gitTop = resolveGitTopLevel(process.cwd());
      const worktreeBasePath = gitTop ? join(gitTop, ".agent-farm", "worktrees") : undefined;
      const doctor = await container.doctorService.build(
        Number(opts.leaseTimeoutSeconds),
        Number(opts.reviewOverdueHours),
        Number(opts.topN),
        gitTop,
        worktreeBasePath && existsSync(worktreeBasePath) ? worktreeBasePath : undefined,
      );
      const report = buildStuckReport(doctor);
      if (opts.brief) {
        for (const line of formatStuckBrief(report)) {
          process.stderr.write(`${line}\n`);
        }
        return;
      }
      print({ ...report, doctor_ok: doctor.ok });
    });

  stuck
    .command("retry")
    .description("一键将任务标为 retry（running/claimed/failed/rejected）")
    .requiredOption("--task-id <id>", "task id")
    .option("--reason <text>", "last_error reason", "manual stuck retry")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
    .action(async (opts) => {
      const container = await createCliQueueContainer({
        taskFile: String(opts.taskFile),
        quarantineFile: String(opts.quarantineFile),
      });
      const result = await container.queueService.manualRetryTask(String(opts.taskId), String(opts.reason));
      print(result);
      if (result.ok !== true) {
        process.exitCode = 1;
      }
    });

  stuck
    .command("recover")
    .description("批量 recover-stale（等同 queue recover-stale）")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
    .action(async (opts) => {
      const container = await createCliQueueContainer({ taskFile: String(opts.taskFile) });
      print(await container.queueService.recoverStale(Number(opts.leaseTimeoutSeconds)));
    });
}
