import type { JsonMap } from "../../domain/task.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import { processClaimedTask } from "../worker/process-claimed-task/index.js";
import { taskEvent } from "../worker/process-claimed-task/events.js";
import { EXEC_OUTPUT_CAP } from "../worker/worker-output-limits.js";
import type { QueueService } from "./queue.js";

export type WorkerOptions = {
  queueService: QueueService;
  eventRepo: EventRepository;
  runsDir: string;
  /** 仓库根（--workspace）；无 git-worktree 时即任务目录，否则为含 node_modules 的主仓库根 */
  workspaceDir: string;
  workers: number;
  loopSleepMs: number;
  commandTemplate: string;
  leaseTimeoutSeconds: number;
  poisonMaxAttempts: number;
  autoApproveReview: boolean;
  verifyCommandTemplate?: string;
  /** 确定性 verify 通过后执行；用于 LLM/脚本语义验收，非 0 则 retry */
  aiReviewCommandTemplate?: string;
  /** 为 true 时：除 skip_ai_review 任务外，每条任务必须配置全局或 per-task 的 AI 验收模板，否则 blocked */
  requireAiReview?: boolean;
  /** 子进程执行器（由组合根注入默认实现或测试替身） */
  runShell: ShellRunner;
  /** 事件时间戳等用（由组合根注入系统时钟或测试固定时间） */
  clock: IsoClock;
  /** 每条任务使用独立 git worktree（需仓库根为 git 仓库） */
  gitWorktreeParallel?: boolean;
  /** OpenCode NDJSON 可观测与失败自愈提示（execute 阶段） */
  opencodeJsonEvents?: boolean;
};

export async function runWorkerLoop(opts: WorkerOptions): Promise<void> {
  while (true) {
    await opts.queueService.recoverStale(opts.leaseTimeoutSeconds);
    await opts.queueService.quarantinePoison(opts.poisonMaxAttempts);
    const pending = await opts.queueService.claimTasks(opts.workers);
    if (pending.length === 0) break;
    const results = await Promise.allSettled(
      pending.map(async (task: JsonMap) =>
        processClaimedTask({
          task,
          workspaceDir: opts.workspaceDir,
          runsDir: opts.runsDir,
          commandTemplate: opts.commandTemplate,
          verifyCommandTemplate: String(opts.verifyCommandTemplate ?? ""),
          aiReviewCommandTemplate: String(opts.aiReviewCommandTemplate ?? ""),
          requireAiReview: Boolean(opts.requireAiReview),
          autoApproveReview: opts.autoApproveReview,
          taskCommands: opts.queueService,
          eventRepo: opts.eventRepo,
          runShell: opts.runShell,
          clock: opts.clock,
          gitWorktreeParallel: Boolean(opts.gitWorktreeParallel),
          opencodeJsonEvents: Boolean(opts.opencodeJsonEvents),
        })
      )
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status !== "rejected") continue;
      const task = pending[i]!;
      const taskId = String(task.task_id ?? "");
      const err = r.reason;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[agent-farm worker] task batch item failed: ${taskId}: ${msg}`);
      const attemptPlus1 = Number(task.attempt ?? 0) + 1;
      try {
        await opts.queueService.updateStatus(taskId, "retry", {
          attempt: attemptPlus1,
          last_error: msg.slice(0, EXEC_OUTPUT_CAP),
        });
      } catch (e) {
        const emsg = e instanceof Error ? e.message : String(e);
        console.error(`[agent-farm worker] failed to mark retry after crash: ${taskId}: ${emsg}`);
        continue;
      }
      await opts.eventRepo.append(
        taskEvent({
          ts: opts.clock(),
          event: "task_failed",
          task_id: taskId,
          attempt: attemptPlus1,
          stage: "worker",
        }),
      );
      await opts.eventRepo.append(
        taskEvent({
          ts: opts.clock(),
          event: "task_retry",
          task_id: taskId,
          attempt: attemptPlus1,
          stage: "worker",
        }),
      );
    }
    await new Promise((r) => setTimeout(r, opts.loopSleepMs));
  }
}
