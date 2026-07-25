import type { ExecutionMemoryRepository } from "../../domain/ports/repositories.js";
import type { ExecutionMemoryRecord, DiffSummary } from "../../domain/execution-memory/model.js";
import type { JsonMap } from "../../domain/task.js";
import { countWorkingTreeDiffLines, runGitCapture } from "./git-context.js";
import { resolveModelFromContext } from "../executors/resolve-model.js";
import type { AgentFarmProjectConfig } from "../contracts/agent-farm-project-config.js";

const PROMPT_CAP = 2000;

function collectDiffSummary(workspace: string): DiffSummary | null {
  try {
    const nameStatus = runGitCapture(workspace, ["diff", "--name-only"]);
    if (!nameStatus.ok) return null;
    const files = nameStatus.stdout
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    if (files.length === 0) return null;

    const added = countWorkingTreeDiffLines(workspace);
    // countWorkingTreeDiffLines returns total (insertions + deletions) across working tree + staged
    // We approximate: use the raw diff to split
    let linesAdded = 0;
    let linesRemoved = 0;
    for (const args of [
      ["diff", "--numstat"],
      ["diff", "--cached", "--numstat"],
    ] as const) {
      const r = runGitCapture(workspace, [...args]);
      if (!r.ok) continue;
      for (const line of r.stdout.split("\n")) {
        const parts = line.trim().split(/\t/);
        if (parts.length < 3) continue;
        const add = parseInt(parts[0] ?? "0", 10);
        const del = parseInt(parts[1] ?? "0", 10);
        if (!isNaN(add)) linesAdded += add;
        if (!isNaN(del)) linesRemoved += del;
      }
    }
    return { files, lines_added: linesAdded, lines_removed: linesRemoved };
  } catch {
    return null;
  }
}

/** 在任务到达终态时写入执行记忆。失败静默（不阻断任务管线）。 */
export async function recordExecutionMemory(params: {
  task: JsonMap;
  taskWorkspace: string;
  exitCode: number;
  durationMs: number;
  terminalStatus: string;
  projectConfig?: AgentFarmProjectConfig | null;
  executionMemoryRepo: ExecutionMemoryRepository;
}): Promise<void> {
  try {
    const { task, taskWorkspace, exitCode, durationMs, terminalStatus, projectConfig, executionMemoryRepo } = params;
    const dedupeKey = String(task.dedupe_key ?? "");
    const taskId = String(task.task_id ?? "");
    const prompt = String(task.prompt ?? "").slice(0, PROMPT_CAP);
    const model = resolveModelFromContext(task, projectConfig) ?? "";
    const taskType = String(task.task_type ?? "");

    const diffSummary = collectDiffSummary(taskWorkspace);

    const record: ExecutionMemoryRecord = {
      task_id: taskId,
      dedupe_key: dedupeKey,
      prompt,
      model,
      exit_code: exitCode,
      diff_summary: diffSummary,
      duration_ms: durationMs,
      task_type: taskType,
      terminal_status: terminalStatus,
      created_at: new Date().toISOString(),
    };

    await executionMemoryRepo.insert(record);
  } catch (err) {
    // 非关键路径：只打日志，不阻断任务
    console.error(
      `[agent-farm] failed to record execution memory for task ${String(params.task.task_id ?? "")}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
