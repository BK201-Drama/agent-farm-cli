import type { JsonMap } from "../../domain/task.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import { runShellCommand } from "../../infrastructure/process/shell.js";
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
  /** 单测注入，替代默认 bash 子进程 */
  runShell?: ShellRunner;
};

export async function runWorkerLoop(opts: WorkerOptions): Promise<void> {
  const runShell = opts.runShell ?? runShellCommand;
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
          runShell,
        })
      )
    );
    await new Promise((r) => setTimeout(r, opts.loopSleepMs));
  }
}
