import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processClaimedTask } from "../../src/application/worker/process-claimed-task/index.js";
import { QueueService } from "../../src/application/facades/queue.js";
import type { TaskRecord } from "../../src/domain/task.js";
import type { EventRecord } from "../../src/domain/event.js";
import { ACTIVE_STATUSES, type TaskStatus } from "../../src/domain/task.js";
import type { EventRepository, QuarantineRepository, TaskRepository } from "../../src/domain/ports/repositories.js";
import type { ShellRunner } from "../../src/domain/ports/shell-runner.js";
import type { GitWorkspacePort } from "../../src/application/contracts/git-workspace.js";
import type { ProjectConfigPort } from "../../src/application/contracts/agent-farm-project-config.js";

const TEST_ISO = "2024-01-01T00:00:00.000Z";

const testProjectConfig: ProjectConfigPort = { load: () => null };

const testGitWorkspace: GitWorkspacePort = {
  resolveGitTopLevel: () => null,
  sanitizeTaskIdForPath: (id) => id.replace(/[^a-zA-Z0-9._-]+/g, "_"),
  findOrphanWorktrees: () => [],
  createAgentFarmWorktree: () => {
    throw new Error("worktree not used in unit test");
  },
  commitWorktreeSnapshot: () => ({ dirty: false, ok: true, committed: false, stdoutStderr: "" }),
  mergeAgentFarmBranchSerialized: async () => ({ ok: true, combined: "" }),
};

function makeHarness(initial: TaskRecord[]): {
  queueService: QueueService;
  eventRepo: EventRepository;
  events: EventRecord[];
  rowsRef: () => TaskRecord[];
} {
  let rows = initial.map((r) => ({ ...r }));
  const events: EventRecord[] = [];
  const taskRepo: TaskRepository = {
    async list() {
      return rows;
    },
    async save(next) {
      rows = next;
    },
    async hasActiveDuplicateDedupeKey(dedupeKey: string, excludeTaskId: string) {
      const key = dedupeKey.trim();
      if (!key) return false;
      return rows.some(
        (x) =>
          String(x.task_id ?? "") !== excludeTaskId &&
          ACTIVE_STATUSES.has(String(x.status ?? "") as TaskStatus) &&
          String(x.dedupe_key ?? "").trim() === key
      );
    },
  };
  const quarantineRepo: QuarantineRepository = {
    async list() {
      return [];
    },
    async append() {
      /* noop */
    },
  };
  const queueService = new QueueService(taskRepo, quarantineRepo, () => TEST_ISO);
  const eventRepo: EventRepository = {
    async list() {
      return events;
    },
    async append(e) {
      events.push(e);
    },
  };
  return { queueService, eventRepo, events, rowsRef: () => rows };
}

async function runOnce(
  task: TaskRecord,
  opts: Partial<{
    commandTemplate: string;
    verifyCommandTemplate: string;
    aiReviewCommandTemplate: string;
    requireAiReview: boolean;
    autoApproveReview: boolean;
    runShell: ShellRunner;
  }> & { rows?: TaskRecord[] }
) {
  const rows = opts.rows ?? [task];
  const { queueService, eventRepo, ...rest } = makeHarness(rows);
  const scratch = mkdtempSync(join(tmpdir(), "af-pct-"));
  await processClaimedTask({
    task,
    workspaceDir: join(scratch, "ws"),
    runsDir: join(scratch, "runs"),
    commandTemplate: opts.commandTemplate ?? "true",
    verifyCommandTemplate: opts.verifyCommandTemplate ?? "",
    aiReviewCommandTemplate: opts.aiReviewCommandTemplate ?? "",
    requireAiReview: opts.requireAiReview ?? false,
    autoApproveReview: opts.autoApproveReview ?? false,
    taskCommands: queueService,
    eventRepo,
    runShell:
      opts.runShell ??
      (async () => {
        return { exitCode: 0, output: "ok" };
      }),
    clock: () => TEST_ISO,
    projectConfig: testProjectConfig,
    gitWorkspace: testGitWorkspace,
  });
  return rest;
}

describe("processClaimedTask", () => {
  it("empty-run abort marks retry once with empty-run-fix prompt", async () => {
    const task: TaskRecord = {
      task_id: "t-empty",
      status: "claimed",
      prompt: "implement feature",
      dedupe_key: "d-empty",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    const { events, rowsRef } = await runOnce(task, {
      autoApproveReview: false,
      runShell: async () => ({
        exitCode: 125,
        output: "[agent-farm] empty-run abort\n",
      }),
    });
    const row = rowsRef().find((r) => r.task_id === "t-empty");
    expect(row?.status).toBe("retry");
    expect(row?.empty_run_retried).toBe(true);
    expect(String(row?.prompt ?? "")).toContain("[empty-run-fix]");
    expect(events.some((e) => e.event === "task_empty_run_retry")).toBe(true);
  });

  it("runs claimed -> done with stub shell and auto-approve", async () => {
    const task: TaskRecord = {
      task_id: "t1",
      status: "claimed",
      prompt: "do it",
      dedupe_key: "d1",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    const { events, rowsRef } = await runOnce(task, { autoApproveReview: true });
    const row = rowsRef().find((r) => r.task_id === "t1");
    expect(row?.status).toBe("done");
    expect(events.some((e) => e.event === "task_running")).toBe(true);
    expect(events.some((e) => e.event === "task_done")).toBe(true);
  });

  it("retry on execute failure", async () => {
    const task: TaskRecord = {
      task_id: "t2",
      status: "claimed",
      prompt: "p",
      dedupe_key: "d2",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    let n = 0;
    const { events, rowsRef } = await runOnce(task, {
      runShell: async () => {
        n++;
        return { exitCode: 1, output: "boom" };
      },
    });
    expect(n).toBe(1);
    const row = rowsRef().find((r) => r.task_id === "t2");
    expect(row?.status).toBe("retry");
    expect(row?.attempt).toBe(1);
    expect(events.filter((e) => e.event === "task_failed" && e.stage === "execute").length).toBe(1);
  });

  it("blocks duplicate dedupe before running", async () => {
    const t1: TaskRecord = {
      task_id: "a",
      status: "running",
      dedupe_key: "dup",
      mode: "execute",
      attempt: 0,
    };
    const t2: TaskRecord = {
      task_id: "b",
      status: "claimed",
      dedupe_key: "dup",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    const { events, rowsRef } = await runOnce(t2, { rows: [t1, t2] });
    const row = rowsRef().find((r) => r.task_id === "b");
    expect(row?.status).toBe("blocked");
    expect(events.some((e) => e.event === "task_deduped_blocked")).toBe(true);
    expect(events.some((e) => e.event === "task_running")).toBe(false);
  });

  it("blocks when require-ai-review but no template", async () => {
    const task: TaskRecord = {
      task_id: "t3",
      status: "claimed",
      prompt: "p",
      dedupe_key: "d3",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    const { events, rowsRef } = await runOnce(task, { requireAiReview: true });
    const row = rowsRef().find((r) => r.task_id === "t3");
    expect(row?.status).toBe("blocked");
    expect(events.some((e) => e.event === "task_blocked")).toBe(true);
  });

  it("appends [ai-review-fix] on ai-review failure", async () => {
    const task: TaskRecord = {
      task_id: "t4",
      status: "claimed",
      prompt: "base",
      dedupe_key: "d4",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    let calls = 0;
    const { rowsRef } = await runOnce(task, {
      aiReviewCommandTemplate: "true",
      runShell: async () => {
        calls++;
        if (calls === 1) return { exitCode: 0, output: "exec ok" };
        return { exitCode: 1, output: "judge says no" };
      },
    });
    const row = rowsRef().find((r) => r.task_id === "t4");
    expect(row?.status).toBe("retry");
    expect(String(row?.prompt ?? "")).toContain("[ai-review-fix]");
    expect(String(row?.prompt ?? "")).toContain("judge says no");
  });

  it("pass verdict overrides non-zero exit and task proceeds to done", async () => {
    const task: TaskRecord = {
      task_id: "t5",
      status: "claimed",
      prompt: "base",
      dedupe_key: "d5",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    let calls = 0;
    const { rowsRef, events } = await runOnce(task, {
      aiReviewCommandTemplate: "true",
      autoApproveReview: true,
      runShell: async () => {
        calls++;
        if (calls === 1) return { exitCode: 0, output: "exec ok" };
        return { exitCode: 1, output: 'log line\n{"verdict":"pass"}' };
      },
    });
    const row = rowsRef().find((r) => r.task_id === "t5");
    expect(row?.status).toBe("done");
    expect(events.some((e) => e.event === "task_ai_review_ok")).toBe(true);
    expect(events.some((e) => e.event === "task_done")).toBe(true);
  });

  it("fail verdict overrides zero exit and enters retry", async () => {
    const task: TaskRecord = {
      task_id: "t6",
      status: "claimed",
      prompt: "base",
      dedupe_key: "d6",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    let calls = 0;
    const { rowsRef } = await runOnce(task, {
      aiReviewCommandTemplate: "true",
      runShell: async () => {
        calls++;
        if (calls === 1) return { exitCode: 0, output: "exec ok" };
        return { exitCode: 0, output: '{"verdict":"fail","reason":"logic error"}' };
      },
    });
    const row = rowsRef().find((r) => r.task_id === "t6");
    expect(row?.status).toBe("retry");
    expect(String(row?.prompt ?? "")).toContain("[ai-review-fix]");
    expect(String(row?.prompt ?? "")).toContain("logic error");
    expect(String(row?.last_error ?? "")).toContain("verdict fail: logic error");
  });

  it("uses per-task execute_command_template when set", async () => {
    const task: TaskRecord = {
      task_id: "t-exec-ov",
      status: "claimed",
      prompt: "p",
      dedupe_key: "d-exec-ov",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
      execute_command_template: "echo PER_TASK_EXEC_MARKER",
    };
    const seen: string[] = [];
    await runOnce(task, {
      commandTemplate: "echo GLOBAL_FALLBACK_MARKER",
      autoApproveReview: true,
      runShell: async (cmd) => {
        seen.push(cmd);
        return { exitCode: 0, output: "ok" };
      },
    });
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toContain("PER_TASK_EXEC_MARKER");
    expect(seen[0]).not.toContain("GLOBAL_FALLBACK_MARKER");
  });

  it("uses per-task verify_command_template when set", async () => {
    const task: TaskRecord = {
      task_id: "t-verify-ov",
      status: "claimed",
      prompt: "p",
      dedupe_key: "d-verify-ov",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
      verify_command_template: "echo VERIFY_PER_TASK",
    };
    const seen: string[] = [];
    await runOnce(task, {
      verifyCommandTemplate: "echo VERIFY_GLOBAL",
      autoApproveReview: true,
      runShell: async (cmd) => {
        seen.push(cmd);
        return { exitCode: 0, output: "ok" };
      },
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[1]).toContain("VERIFY_PER_TASK");
    expect(seen[1]).not.toContain("VERIFY_GLOBAL");
  });

  it("exit code still works when no verdict JSON", async () => {
    const task: TaskRecord = {
      task_id: "t7",
      status: "claimed",
      prompt: "base",
      dedupe_key: "d7",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    let calls = 0;
    const { rowsRef } = await runOnce(task, {
      aiReviewCommandTemplate: "true",
      runShell: async () => {
        calls++;
        if (calls === 1) return { exitCode: 0, output: "exec ok" };
        return { exitCode: 1, output: "no verdict here" };
      },
    });
    const row = rowsRef().find((r) => r.task_id === "t7");
    expect(row?.status).toBe("retry");
    expect(String(row?.last_error ?? "")).toContain("ai-review failed");
  });

  // M4a 集成测试
  it("doc_gen task_type appends prompt_suffix and skips verify", async () => {
    const task: TaskRecord = {
      task_id: "t-doc-gen",
      status: "claimed",
      prompt: "生成 API 文档",
      dedupe_key: "d-doc-gen",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
      task_type: "doc_gen",
    };
    const seen: string[] = [];
    const { rowsRef } = await runOnce(task, {
      commandTemplate: "echo {prompt}", // 让 prompt 出现在命令中可验证
      autoApproveReview: true,
      verifyCommandTemplate: "echo verify-should-be-skipped",
      runShell: async (cmd) => {
        seen.push(cmd);
        return { exitCode: 0, output: "ok" };
      },
    });
    const row = rowsRef().find((r) => r.task_id === "t-doc-gen");
    expect(row?.status).toBe("done");
    // execute 阶段应收到追加了 prompt_suffix 的命令
    const execCmd = seen.find((c) => !c.includes("verify"));
    expect(execCmd).toBeDefined();
    expect(execCmd).toContain("Markdown");
    expect(execCmd).toContain("不要修改任何源代码");
    // verify 应被跳过（diff_only 策略）
    const verifyCmds = seen.filter((c) => c.includes("verify-should-be-skipped"));
    expect(verifyCmds).toHaveLength(0);
  });

  it("code_gen task_type still runs verify normally", async () => {
    const task: TaskRecord = {
      task_id: "t-code-gen",
      status: "claimed",
      prompt: "implement feature",
      dedupe_key: "d-code-gen",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
      task_type: "code_gen",
    };
    const seen: string[] = [];
    const { rowsRef } = await runOnce(task, {
      commandTemplate: "echo {prompt}",
      autoApproveReview: true,
      verifyCommandTemplate: "echo verify-must-run",
      runShell: async (cmd) => {
        seen.push(cmd);
        return { exitCode: 0, output: "ok" };
      },
    });
    const row = rowsRef().find((r) => r.task_id === "t-code-gen");
    expect(row?.status).toBe("done");
    // code_gen 的 lint_test 策略不跳过 verify
    const verifyCmds = seen.filter((c) => c.includes("verify-must-run"));
    expect(verifyCmds.length).toBeGreaterThanOrEqual(1);
  });
});
