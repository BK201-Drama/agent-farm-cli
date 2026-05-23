import type { JsonMap, TaskRecord, TaskStatus } from "../../domain/task.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import type { QuarantineRepository, TaskRepository } from "../../domain/ports/repositories.js";
import type { ClaimedTaskCommands } from "../contracts/claimed-task-commands.js";
import { AddTaskUseCase } from "../use-cases/task/add-task.js";
import { BatchCancelTasksUseCase } from "../use-cases/task/batch-cancel-tasks.js";
import { CheckActiveDedupeUseCase } from "../use-cases/task/check-active-dedupe.js";
import { ClaimTasksUseCase } from "../use-cases/task/claim-tasks.js";
import { GetTaskUseCase } from "../use-cases/task/get-task.js";
import { ListTasksUseCase, type ListTasksOptions } from "../use-cases/task/list-tasks.js";
import { QuarantinePoisonUseCase } from "../use-cases/task/quarantine-poison.js";
import { RecoverStaleUseCase } from "../use-cases/task/recover-stale.js";
import { ReviewApproveUseCase } from "../use-cases/task/review-approve.js";
import { ReviewRejectUseCase } from "../use-cases/task/review-reject.js";
import { TouchHeartbeatUseCase } from "../use-cases/task/touch-heartbeat.js";
import { ManualRetryTaskUseCase } from "../use-cases/task/manual-retry-task.js";
import { UpdateTaskStatusUseCase } from "../use-cases/task/update-task-status.js";

/**
 * 队列应用门面：对外保持原有 API，对内委托各用例（DDD 应用层编排）。
 * 同时满足 {@link ClaimedTaskCommands}，供 worker 收窄依赖。
 */
export class QueueService implements ClaimedTaskCommands {
  private readonly addTaskUseCase: AddTaskUseCase;
  private readonly listTasksUseCase: ListTasksUseCase;
  private readonly getTaskUseCase: GetTaskUseCase;
  private readonly checkActiveDedupeUseCase: CheckActiveDedupeUseCase;
  private readonly claimTasksUseCase: ClaimTasksUseCase;
  private readonly updateTaskStatusUseCase: UpdateTaskStatusUseCase;
  private readonly touchHeartbeatUseCase: TouchHeartbeatUseCase;
  private readonly reviewApproveUseCase: ReviewApproveUseCase;
  private readonly reviewRejectUseCase: ReviewRejectUseCase;
  private readonly recoverStaleUseCase: RecoverStaleUseCase;
  private readonly quarantinePoisonUseCase: QuarantinePoisonUseCase;
  private readonly batchCancelTasksUseCase: BatchCancelTasksUseCase;
  private readonly manualRetryTaskUseCase: ManualRetryTaskUseCase;

  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly quarantineRepo: QuarantineRepository,
    clock: IsoClock,
  ) {
    this.addTaskUseCase = new AddTaskUseCase(taskRepo, clock);
    this.listTasksUseCase = new ListTasksUseCase(taskRepo);
    this.getTaskUseCase = new GetTaskUseCase(taskRepo);
    this.checkActiveDedupeUseCase = new CheckActiveDedupeUseCase(taskRepo);
    this.claimTasksUseCase = new ClaimTasksUseCase(taskRepo, clock);
    this.updateTaskStatusUseCase = new UpdateTaskStatusUseCase(taskRepo, clock);
    this.batchCancelTasksUseCase = new BatchCancelTasksUseCase(taskRepo, this.updateTaskStatusUseCase);
    this.touchHeartbeatUseCase = new TouchHeartbeatUseCase(taskRepo, clock);
    this.reviewApproveUseCase = new ReviewApproveUseCase(taskRepo, clock);
    this.reviewRejectUseCase = new ReviewRejectUseCase(taskRepo);
    this.recoverStaleUseCase = new RecoverStaleUseCase(taskRepo, clock);
    this.quarantinePoisonUseCase = new QuarantinePoisonUseCase(taskRepo, quarantineRepo, clock);
    this.manualRetryTaskUseCase = new ManualRetryTaskUseCase(taskRepo, clock);
  }

  async addTask(task: JsonMap): Promise<TaskRecord> {
    return this.addTaskUseCase.execute(task);
  }

  async listTasks(options: ListTasksOptions = {}): Promise<TaskRecord[]> {
    return this.listTasksUseCase.execute(options);
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    return this.getTaskUseCase.execute(taskId);
  }

  async hasActiveDuplicateDedupeForTask(task: JsonMap): Promise<boolean> {
    return this.checkActiveDedupeUseCase.execute(task);
  }

  async claimTasks(limit: number): Promise<TaskRecord[]> {
    return this.claimTasksUseCase.execute(limit);
  }

  async updateStatus(taskId: string, status: TaskStatus, extra: JsonMap = {}): Promise<boolean> {
    return this.updateTaskStatusUseCase.execute(taskId, status, extra);
  }

  async touchHeartbeat(taskId: string): Promise<boolean> {
    return this.touchHeartbeatUseCase.execute(taskId);
  }

  async reviewApprove(taskId: string, reviewer: string, notes: string, spawnExecute: boolean): Promise<JsonMap> {
    return this.reviewApproveUseCase.execute(taskId, reviewer, notes, spawnExecute);
  }

  async reviewReject(taskId: string, reviewer: string, reason: string, moveToRetry: boolean): Promise<JsonMap> {
    return this.reviewRejectUseCase.execute(taskId, reviewer, reason, moveToRetry);
  }

  async recoverStale(leaseTimeoutSeconds: number): Promise<JsonMap> {
    return this.recoverStaleUseCase.execute(leaseTimeoutSeconds);
  }

  async quarantinePoison(maxAttempts: number): Promise<JsonMap> {
    return this.quarantinePoisonUseCase.execute(maxAttempts);
  }

  async batchCancel(fromStatuses: string[], reason: string): Promise<JsonMap> {
    return this.batchCancelTasksUseCase.execute(new Set(fromStatuses), reason);
  }

  async manualRetryTask(taskId: string, reason?: string): Promise<JsonMap> {
    return this.manualRetryTaskUseCase.execute(taskId, reason);
  }
}
