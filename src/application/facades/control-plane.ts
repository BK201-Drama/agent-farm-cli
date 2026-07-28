import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveQueueWorkspace } from "../../domain/task/queue-workspace-paths.js";
import type { JsonMap } from "../../domain/task.js";
import { createContainer } from "../../bootstrap/container.js";
import type { ContainerPorts } from "../contracts/container-ports.js";
import { buildStuckReport } from "./stuck-report.js";
import { buildControlPlaneHealth, type ControlPlaneHealth } from "./control-plane-health.js";
import type { DecisionRequest, DecisionResult, DecisionRecord } from "../../domain/decision/model.js";
import { acceptanceProgressPath, readProgress } from "../acceptance/progress-store.js";
import { getAcceptanceStatus } from "../acceptance/status.js";
import { acceptanceTaskKeyPrefix } from "../acceptance/acceptance-task-key.js";

export type ControlPlaneView = {
  ok: boolean;
  generated_at: string;
  health: ControlPlaneHealth;
  queue_workspace: JsonMap;
  board: JsonMap;
  status: JsonMap;
  stuck: ReturnType<typeof buildStuckReport>;
};

export type ControlPlanePaths = {
  taskFile?: string;
  eventFile?: string;
  quarantineFile?: string;
};

type ControlPlaneContainer = ReturnType<typeof createContainer>;

export class ControlPlaneService {
  private static readonly LEASE_TIMEOUT_SECONDS = 1800;
  private static readonly POISON_MAX_ATTEMPTS = 3;

  private containerPromise?: Promise<ControlPlaneContainer>;

  constructor(
    private readonly cwd: string,
    private readonly paths: ControlPlanePaths = {},
    private readonly portOverrides?: Partial<ContainerPorts>,
  ) {}

  private async container(): Promise<ControlPlaneContainer> {
    if (this.containerPromise) return this.containerPromise;

    this.containerPromise = (async () => {
      const w = resolveQueueWorkspace(this.cwd);
      const c = createContainer(
        {
          storage: w.storage,
          dbFile: w.dbFile,
          taskFile: this.paths.taskFile ?? w.taskFile,
          eventFile: this.paths.eventFile ?? w.eventFile,
          quarantineFile: this.paths.quarantineFile ?? w.quarantineFile,
        },
        this.portOverrides,
      );

      await c.queueService.recoverStale(ControlPlaneService.LEASE_TIMEOUT_SECONDS);
      await c.queueService.quarantinePoison(ControlPlaneService.POISON_MAX_ATTEMPTS);

      return c;
    })();

    return this.containerPromise;
  }

  async buildView(opts?: {
    leaseTimeoutSeconds?: number;
    reviewOverdueHours?: number;
    topN?: number;
  }): Promise<ControlPlaneView> {
    const lease = opts?.leaseTimeoutSeconds ?? 1800;
    const reviewH = opts?.reviewOverdueHours ?? 2;
    const topN = opts?.topN ?? 5;
    const w = resolveQueueWorkspace(this.cwd);
    const container = await this.container();
    const gitTop = container.ports.gitWorkspace.resolveGitTopLevel(this.cwd);
    const worktreeBasePath = gitTop ? join(gitTop, ".agent-farm", "worktrees") : undefined;
    const doctor = await container.doctorService.build(
      lease,
      reviewH,
      topN,
      gitTop,
      worktreeBasePath && existsSync(worktreeBasePath) ? worktreeBasePath : undefined,
    );
    const board = await container.insightsService.buildBoardSnapshot();
    const status = await container.statusService.build(topN);
    const stuck = buildStuckReport(doctor);
    const health = buildControlPlaneHealth(this.cwd, doctor, status, stuck);
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      health,
      queue_workspace: { ...w } as JsonMap,
      board,
      status,
      stuck,
    };
  }

  async buildHealth(opts?: {
    leaseTimeoutSeconds?: number;
    reviewOverdueHours?: number;
    topN?: number;
  }): Promise<ControlPlaneHealth> {
    const view = await this.buildView(opts);
    return view.health;
  }

  async dispatchPrompt(prompt: string, dedupeKey?: string): Promise<JsonMap> {
    const key = (dedupeKey ?? `control-plane-${Date.now()}`).trim();
    const container = await this.container();
    const task = await container.queueService.addTask({
      task_id: `cp-${Date.now()}`,
      dedupe_key: key,
      prompt: prompt.trim(),
      mode: "execute",
      topic: "control-plane",
    });
    return { ok: true, task };
  }

  async stuckRetry(taskId: string, reason?: string): Promise<JsonMap> {
    const id = taskId.trim();
    if (!id) {
      return { ok: false, error: "task_id required" };
    }
    return (await this.container()).queueService.manualRetryTask(id, reason?.trim() || "control-plane stuck retry");
  }

  async stuckRecover(leaseTimeoutSeconds = 1800): Promise<JsonMap> {
    return (await this.container()).queueService.recoverStale(leaseTimeoutSeconds);
  }

  async stuckReviewApprove(taskId: string, reviewer = "control-plane"): Promise<JsonMap> {
    const id = taskId.trim();
    if (!id) return { ok: false, error: "task_id required" };
    return (await this.container()).queueService.reviewApprove(id, reviewer, "sidebar approve", false);
  }

  /** 决策仲裁：worker 上报决策请求，自动裁决或升级 */
  async requestDecision(request: DecisionRequest): Promise<DecisionResult> {
    return (await this.container()).decisionService.requestDecision(request);
  }

  /** 决策仲裁：解决升级决策 */
  async resolveEscalation(escalationId: string, choice: string, reason: string, resetTask: boolean): Promise<JsonMap> {
    return (await this.container()).decisionService.resolveEscalation(escalationId, choice, reason, resetTask);
  }

  /** 决策仲裁：列出升级待决项 */
  async listEscalations(taskId?: string): Promise<DecisionRecord[]> {
    return (await this.container()).decisionService.listEscalations(taskId);
  }

  /** Spec Acceptance Runtime：查询验收状态（reconcile 后判定 done） */
  async acceptanceStatus(pocId: string): Promise<JsonMap> {
    const farmRoot = this.cwd;
    const progressPath = acceptanceProgressPath(farmRoot, pocId);
    const progress = await readProgress(progressPath);

    if (!progress) {
      return { ok: false, error: `No progress file found for POC "${pocId}" at ${progressPath}` };
    }

    const container = await this.container();
    const allTasks = await container.queueService.listTasks();
    const taskStatuses = new Map<string, string>();
    const prefix = acceptanceTaskKeyPrefix(pocId);

    for (const task of allTasks) {
      const dk = task.dedupe_key;
      if (dk && String(dk).startsWith(prefix)) {
        taskStatuses.set(String(dk), String(task.status ?? "queued"));
      }
    }

    const status = getAcceptanceStatus({ progress, taskStatuses });

    return {
      ok: true,
      poc_id: pocId,
      done: status.done,
      demo: status.progress.demo,
      items: status.progress.items,
      updated_at: status.progress.updated_at,
    };
  }
}
