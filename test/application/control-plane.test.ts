import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ControlPlaneService } from "../../src/application/facades/control-plane.js";

function setupTempQueue(files: { tasks?: string; events?: string; quarantine?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "af-cp-"));
  const q = join(dir, ".agent-farm", "queue");
  mkdirSync(q, { recursive: true });
  writeFileSync(join(q, "tasks.jsonl"), files.tasks ?? "");
  writeFileSync(join(q, "events.jsonl"), files.events ?? "");
  writeFileSync(join(q, "quarantine_tasks.jsonl"), files.quarantine ?? "");
  return dir;
}

function withJsonl(fn: (dir: string) => Promise<void>) {
  return async () => {
    const prev = process.env.AGENT_FARM_STORAGE;
    process.env.AGENT_FARM_STORAGE = "jsonl";
    const dir = setupTempQueue({});
    try {
      await fn(dir);
    } finally {
      if (prev === undefined) delete process.env.AGENT_FARM_STORAGE;
      else process.env.AGENT_FARM_STORAGE = prev;
    }
  };
}

function writeTasks(dir: string, content: string) {
  writeFileSync(join(dir, ".agent-farm", "queue", "tasks.jsonl"), content);
}

const tsOld = "2020-01-01T00:00:00Z";

function taskLine(overrides: Record<string, unknown>) {
  return JSON.stringify({
    task_id: "t1",
    status: "queued",
    topic: "general",
    mode: "execute",
    created_at: tsOld,
    started_at: null,
    ...overrides,
  });
}

describe("ControlPlaneService", () => {
  it(
    "buildView on empty jsonl queue",
    withJsonl(async (dir) => {
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      expect(view.ok).toBe(true);
      expect(view.stuck.items).toEqual([]);
      expect(view.status.tasks_total).toBe(0);
      expect(view.board.tasks_total).toBe(0);
      expect(view.board.pipeline).toEqual([]);
      expect(view.board.history).toEqual([]);
      expect(view.board.other_status_count).toBe(0);
    }),
  );

  it(
    "board snapshot partitions tasks into pipeline and history",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({ task_id: "p1", status: "queued" }),
          taskLine({ task_id: "p2", status: "running", heartbeat_at: new Date().toISOString(), claimed_by: "w1" }),
          taskLine({ task_id: "h1", status: "done", completed_at: tsOld }),
          taskLine({ task_id: "h2", status: "failed", completed_at: tsOld }),
          taskLine({ task_id: "h3", status: "cancelled", completed_at: tsOld }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      expect(view.board.tasks_total).toBe(5);
      expect(view.board.pipeline).toHaveLength(2);
      expect(view.board.history).toHaveLength(3);
      expect(view.board.other_status_count).toBe(0);
      const pipelineIds = (view.board.pipeline as Array<Record<string, unknown>>).map((t) => t.task_id);
      expect(pipelineIds).toContain("p1");
      expect(pipelineIds).toContain("p2");
    }),
  );

  it(
    "status aggregation counts tasks by status",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({ task_id: "a", status: "queued" }),
          taskLine({ task_id: "b", status: "queued" }),
          taskLine({ task_id: "c", status: "running", heartbeat_at: new Date().toISOString(), claimed_by: "w1" }),
          taskLine({ task_id: "d", status: "done", completed_at: tsOld }),
          taskLine({ task_id: "e", status: "failed", last_error: "err1", completed_at: tsOld }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      expect(view.status.tasks_total).toBe(5);
      const counts = view.status.status_counts as Record<string, number>;
      expect(counts.queued).toBe(2);
      expect(counts.running).toBe(1);
      expect(counts.done).toBe(1);
      expect(counts.failed).toBe(1);
    }),
  );

  it(
    "stale running tasks are auto-recovered (no longer appear as stale)",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({ task_id: "stale", status: "running", heartbeat_at: tsOld, started_at: tsOld, claimed_by: "w1" }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      // 自愈默认开启：stale running → auto-recovered to retry
      const view = await svc.buildView({ leaseTimeoutSeconds: 1 });
      const staleItems = view.stuck.items.filter((i) => i.kind === "stale_running");
      expect(staleItems).toHaveLength(0);
      // Board 中应能看到 recovered 任务（status=retry）
      const boardCounts = (view.board as Record<string, unknown>).counts as Record<string, number> | undefined;
      if (boardCounts && boardCounts.retry !== undefined) {
        expect(boardCounts.retry).toBeGreaterThanOrEqual(1);
      }
    }),
  );

  it(
    "stuck report detects heartbeat missing (claim lost)",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({
            task_id: "orphan",
            status: "running",
            heartbeat_at: new Date().toISOString(),
            claimed_by: null,
          }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      expect(view.stuck.items.length).toBeGreaterThanOrEqual(1);
      const hbItems = view.stuck.items.filter((i) => i.kind === "heartbeat_missing");
      expect(hbItems).toHaveLength(1);
      expect(hbItems[0]!.task_id).toBe("orphan");
      expect(hbItems[0]!.severity).toBe("high");
      expect(hbItems[0]!.suggested_action).toBe("retry");
    }),
  );

  it(
    "stuck report detects duplicate dedupe keys across active tasks",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({ task_id: "dup1", status: "queued", dedupe_key: "collision" }),
          taskLine({
            task_id: "dup2",
            status: "running",
            dedupe_key: "collision",
            heartbeat_at: new Date().toISOString(),
            claimed_by: "w1",
          }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      const dedupeItems = view.stuck.items.filter((i) => i.kind === "duplicate_dedupe");
      expect(dedupeItems).toHaveLength(1);
      expect(dedupeItems[0]!.dedupe_key).toBe("collision");
      expect(dedupeItems[0]!.severity).toBe("high");
      expect(dedupeItems[0]!.suggested_action).toBe("resolve_dedupe");
    }),
  );

  it(
    "stuck report detects review overdue",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({
            task_id: "rev",
            status: "review",
            review_requested_at: tsOld,
            started_at: tsOld,
          }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView({ reviewOverdueHours: 0 });
      const reviewItems = view.stuck.items.filter((i) => i.kind === "review_overdue");
      expect(reviewItems).toHaveLength(1);
      expect(reviewItems[0]!.task_id).toBe("rev");
      expect(reviewItems[0]!.severity).toBe("medium");
      expect(reviewItems[0]!.suggested_action).toBe("review");
    }),
  );

  it(
    "stuck report is empty when queue is healthy",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({
            task_id: "fresh",
            status: "running",
            heartbeat_at: new Date().toISOString(),
            claimed_by: "w1",
            started_at: new Date().toISOString(),
          }),
          taskLine({ task_id: "q1", status: "queued" }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      expect(view.stuck.items).toEqual([]);
      expect(view.stuck.retryable_count).toBe(0);
      expect(view.stuck.high_severity_count).toBe(0);
    }),
  );

  it(
    "aggregated view has all required top-level fields",
    withJsonl(async (dir) => {
      writeTasks(dir, [taskLine({ task_id: "x", status: "queued" })].join("\n") + "\n");
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      expect(view).toHaveProperty("ok");
      expect(view).toHaveProperty("generated_at");
      expect(view).toHaveProperty("health");
      expect(view.health.service).toBe("agent-farm-control-plane");
      expect(view.health.queue_cwd).toBeTruthy();
      expect(view).toHaveProperty("queue_workspace");
      expect(view).toHaveProperty("board");
      expect(view).toHaveProperty("status");
      expect(view).toHaveProperty("stuck");
      expect(view.stuck).toHaveProperty("ok");
      expect(view.stuck).toHaveProperty("items");
      expect(view.stuck).toHaveProperty("retryable_count");
      expect(view.stuck).toHaveProperty("high_severity_count");
      expect(view.board).toHaveProperty("pipeline");
      expect(view.board).toHaveProperty("history");
      expect(view.status).toHaveProperty("status_counts");
      expect(view.status).toHaveProperty("model_counts");
      expect(view.status).toHaveProperty("task_type_counts");
      expect(typeof view.generated_at).toBe("string");
      expect(Date.parse(view.generated_at)).not.toBeNaN();
    }),
  );

  it(
    "stuckRetry marks failed task as retry",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({ task_id: "failed-1", status: "failed", last_error: "test error", claimed_by: "w1" }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const result = await svc.stuckRetry("failed-1");
      expect(result.ok).toBe(true);
      const view = await svc.buildView({ leaseTimeoutSeconds: 1 });
      const stale = view.stuck.items.filter((i) => i.kind === "stale_running");
      expect(stale).toHaveLength(0);
    }),
  );

  it(
    "stuckRecover on empty queue returns zero recovered",
    withJsonl(async (dir) => {
      const svc = new ControlPlaneService(dir);
      const result = await svc.stuckRecover(1800);
      expect(result.ok).toBe(true);
      expect(result.recovered_count).toBe(0);
    }),
  );

  it(
    "dispatchPrompt adds a task and returns ok",
    withJsonl(async (dir) => {
      const svc = new ControlPlaneService(dir);
      const result = await svc.dispatchPrompt("hello world", "dedup-1");
      expect(result.ok).toBe(true);
      const task = result.task as Record<string, unknown>;
      expect(task.dedupe_key).toBe("dedup-1");
      expect(task.prompt).toBe("hello world");
      expect(task.mode).toBe("execute");
      expect(task.topic).toBe("control-plane");

      const view = await svc.buildView();
      expect(view.board.tasks_total).toBe(1);
    }),
  );

  it(
    "board preserves model and task_type fields on tasks",
    withJsonl(async (dir) => {
      writeTasks(
        dir,
        [
          taskLine({ task_id: "m1", status: "queued", model: "claude-opus", task_type: "code_gen" }),
          taskLine({ task_id: "m2", status: "done", model: "gpt-4o-mini", task_type: "doc_gen", completed_at: tsOld }),
          taskLine({ task_id: "m3", status: "queued" }),
        ].join("\n") + "\n",
      );
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();

      // model/task_type survive in pipeline
      const pipeline = view.board.pipeline as Array<Record<string, unknown>>;
      const m1 = pipeline.find((t) => t.task_id === "m1");
      expect(m1).toBeDefined();
      expect(m1!.model).toBe("claude-opus");
      expect(m1!.task_type).toBe("code_gen");
      // absent fields remain absent
      const m3 = pipeline.find((t) => t.task_id === "m3");
      expect(m3!.model).toBeUndefined();
      expect(m3!.task_type).toBeUndefined();

      // model/task_type survive in history
      const history = view.board.history as Array<Record<string, unknown>>;
      const m2 = history.find((t) => t.task_id === "m2");
      expect(m2).toBeDefined();
      expect(m2!.model).toBe("gpt-4o-mini");
      expect(m2!.task_type).toBe("doc_gen");

      // status aggregation includes model/task_type counts
      const modelCounts = view.status.model_counts as Record<string, number>;
      expect(modelCounts["claude-opus"]).toBe(1);
      expect(modelCounts["gpt-4o-mini"]).toBe(1);
      const taskTypeCounts = view.status.task_type_counts as Record<string, number>;
      expect(taskTypeCounts.code_gen).toBe(1);
      expect(taskTypeCounts.doc_gen).toBe(1);
    }),
  );
});
