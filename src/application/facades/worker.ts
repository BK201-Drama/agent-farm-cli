import type { JsonMap } from "../../domain/task.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import type { ContainerPorts } from "../contracts/container-ports.js";
import { processClaimedTask } from "../worker/process-claimed-task/index.js";
import { taskEvent } from "../worker/process-claimed-task/events.js";
import { EXEC_OUTPUT_CAP } from "../worker/worker-output-limits.js";
import type { QueueService } from "./queue.js";
import { runWorkerPoolLoop } from "../worker/worker-pool-loop.js";

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
  /** Claude Code stream-json NDJSON 可观测与失败自愈提示（execute 阶段） */
  claudeCodeJsonEvents?: boolean;
  /** 子进程设置按任务隔离的 OPENCODE_DB */
  isolateOpencodeDb?: boolean;
  /** 子进程设置按任务隔离的 CLAUDE_CONFIG_DIR */
  isolateClaudeDb?: boolean;
  /** 与 git worktree 配合：任务 done 后将 agent-farm 分支合并进仓库当前分支 */
  autoMergeWorktree?: boolean;
  /** 为 false 时跳过 stale 恢复（如单次手动运行时不希望自动重试过期任务）。默认 true。 */
  autoRecovery?: boolean;
  /**
   * 连续空 claim 循环次数达到此值后进程以 0 退出。
   * 每次 claim 到 >= 1 条任务时计数清零，claim 返回 0 条则计数 +1。
   * 设为 0 时永不 drain（无限循环）。
   *
   * 多 worker 语义：每个 worker 进程独立计数。
   * 若队列持续有任务流入，任意 worker claim 成功后自身计数清零，
   * 不影响其他 worker 的计数。当所有 worker 都连续 N 轮空 claim
   * 时（即队列已耗尽），各自退出，实现协同 drain。
   */
  drainIdleLoops: number;
  ports: ContainerPorts;
};

export async function runWorkerLoop(opts: WorkerOptions): Promise<void> {
  const ports = opts.ports;

  const runClaimedTask = async (task: JsonMap): Promise<void> => {
    try {
      await processClaimedTask({
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
        claudeCodeJsonEvents: Boolean(opts.claudeCodeJsonEvents),
        isolateOpencodeDb: Boolean(opts.isolateOpencodeDb),
        isolateClaudeDb: Boolean(opts.isolateClaudeDb),
        autoMergeWorktree: Boolean(opts.autoMergeWorktree),
        projectConfig: ports.projectConfig,
        gitWorkspace: ports.gitWorkspace,
      });
    } catch (err) {
      const taskId = String(task.task_id ?? "");
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[agent-farm worker] task failed: ${taskId}: ${msg}`);
      const attemptPlus1 = Number(task.attempt ?? 0) + 1;
      try {
        await opts.queueService.updateStatus(taskId, "retry", {
          attempt: attemptPlus1,
          last_error: msg.slice(0, EXEC_OUTPUT_CAP),
        });
      } catch (e) {
        const emsg = e instanceof Error ? e.message : String(e);
        console.error(`[agent-farm worker] failed to mark retry after crash: ${taskId}: ${emsg}`);
        throw err;
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
  };

  await runWorkerPoolLoop({
    maxConcurrency: opts.workers,
    loopSleepMs: opts.loopSleepMs,
    drainIdleLoops: opts.drainIdleLoops,
    onTick: async () => {
      if (opts.autoRecovery !== false) {
        const result = await opts.queueService.recoverStale(opts.leaseTimeoutSeconds);
        const ids: string[] = (result as any)?.task_ids ?? [];
        for (const id of ids) {
          await opts.eventRepo.append(
            taskEvent({
              ts: opts.clock(),
              event: "task_auto_recovered",
              task_id: id,
              stage: "worker",
            }),
          );
        }
      }
      await opts.queueService.quarantinePoison(opts.poisonMaxAttempts);
    },
    claimTasks: (limit) => opts.queueService.claimTasks(limit),
    runClaimedTask,
  });
}
