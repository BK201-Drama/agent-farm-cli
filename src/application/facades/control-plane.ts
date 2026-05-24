import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveQueueWorkspace } from "../../domain/task/queue-workspace-paths.js";
import type { JsonMap } from "../../domain/task.js";
import { createContainer } from "../../bootstrap/container.js";
import type { ContainerPorts } from "../contracts/container-ports.js";
import { buildStuckReport } from "./stuck-report.js";
import { buildControlPlaneHealth, type ControlPlaneHealth } from "./control-plane-health.js";

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
  private containerCache?: ControlPlaneContainer;

  constructor(
    private readonly cwd: string,
    private readonly paths: ControlPlanePaths = {},
    private readonly portOverrides?: Partial<ContainerPorts>,
  ) {}

  private container(): ControlPlaneContainer {
    if (this.containerCache) return this.containerCache;
    const w = resolveQueueWorkspace(this.cwd);
    this.containerCache = createContainer(
      {
        storage: w.storage,
        dbFile: w.dbFile,
        taskFile: this.paths.taskFile ?? w.taskFile,
        eventFile: this.paths.eventFile ?? w.eventFile,
        quarantineFile: this.paths.quarantineFile ?? w.quarantineFile,
      },
      this.portOverrides,
    );
    return this.containerCache;
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
    const container = this.container();
    const gitTop = container.ports.gitWorkspace.resolveGitTopLevel(this.cwd);
    const worktreeBasePath = gitTop ? join(gitTop, ".agent-farm", "worktrees") : undefined;
    const doctor = await container.doctorService.build(
      lease,
      reviewH,
      topN,
      worktreeBasePath && existsSync(worktreeBasePath) ? worktreeBasePath : undefined,
    );
    const board = await container.insightsService.buildBoardSnapshot();
    const status = await container.statusService.build(topN);
    const stuck = buildStuckReport(doctor as JsonMap);
    const health = buildControlPlaneHealth(this.cwd, doctor as JsonMap, status, stuck);
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      health,
      queue_workspace: w as unknown as JsonMap,
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
    const container = this.container();
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
    return this.container().queueService.manualRetryTask(id, reason?.trim() || "control-plane stuck retry");
  }

  async stuckRecover(leaseTimeoutSeconds = 1800): Promise<JsonMap> {
    return this.container().queueService.recoverStale(leaseTimeoutSeconds);
  }

  async stuckReviewApprove(taskId: string, reviewer = "control-plane"): Promise<JsonMap> {
    const id = taskId.trim();
    if (!id) return { ok: false, error: "task_id required" };
    return this.container().queueService.reviewApprove(id, reviewer, "sidebar approve", false);
  }
}
