import type { JsonMap } from "../../domain/task.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import { processClaimedTask } from "../worker/process-claimed-task.js";
import { QueueService } from "./queue-service.js";

export type WorkerOptions = {
  queueService: QueueService;
  eventRepo: EventRepository;
  runsDir: string;
  /** 仓库根目录；用于 `{workspace}` 占位符与 `AGENT_FARM_WORKSPACE` 环境变量 */
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
};

export async function runWorkerLoop(opts: WorkerOptions): Promise<void> {
  while (true) {
    await opts.queueService.recoverStale(opts.leaseTimeoutSeconds);
    await opts.queueService.quarantinePoison(opts.poisonMaxAttempts);
    const pending = await opts.queueService.claimTasks(opts.workers);
    if (pending.length === 0) break;
    await Promise.all(
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
          queueService: opts.queueService,
          eventRepo: opts.eventRepo,
          runShell: opts.runShell,
          clock: opts.clock,
        })
      )
    );
    await new Promise((r) => setTimeout(r, opts.loopSleepMs));
  }
}
