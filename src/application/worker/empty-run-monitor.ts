import { existsSync } from "node:fs";
import { join } from "node:path";
import { runGitCapture } from "./git-context.js";
import type { AgentStreamObserver } from "./run-opencode-aware-shell.js";
import type { ResolvedEmptyRunConfig } from "./empty-run-config.js";

export type EmptyRunCheckResult = {
  abort: boolean;
  reason?: string;
  signals?: string[];
};

export function hasWorkingTreeChanges(workspace: string): boolean {
  const r = runGitCapture(workspace, ["status", "--porcelain"]);
  if (!r.ok) return false;
  return r.stdout.trim().length > 0;
}

export function executeReportExists(runsDir: string, taskId: string, attempt: number): boolean {
  return existsSync(join(runsDir, taskId, `execute-${attempt}.json`));
}

export type EmptyRunMonitor = {
  check: () => EmptyRunCheckResult;
};

export function createEmptyRunMonitor(opts: {
  workspaceDir: string;
  runsDir: string;
  taskId: string;
  attempt: number;
  config: ResolvedEmptyRunConfig;
  startedAtMs: number;
  getStreamObs: () => AgentStreamObserver | undefined;
}): EmptyRunMonitor {
  const graceMs = opts.config.graceMinutes * 60_000;
  let earlyWarned = false;

  return {
    check(): EmptyRunCheckResult {
      if (!opts.config.enabled) return { abort: false };

      const elapsed = Date.now() - opts.startedAtMs;
      const snap = opts.getStreamObs()?.snapshot();

      const noGit = !hasWorkingTreeChanges(opts.workspaceDir);
      const noToolCalls = (snap?.toolCallCount ?? 0) < opts.config.minToolCalls;

      if (!earlyWarned && elapsed >= graceMs / 2 && noGit && noToolCalls) {
        earlyWarned = true;
        console.warn(
          `[agent-farm] empty-run early warning (task ${opts.taskId}): ` +
            `no git diff and no tool calls after ${Math.round(elapsed / 60_000)}m`,
        );
      }

      if (elapsed < graceMs) return { abort: false };

      const signals: string[] = [];
      if (noGit) signals.push("no_git_diff");

      const lineCount = (snap?.linesOk ?? 0) + (snap?.linesInvalid ?? 0);
      const lowAgentOutput = lineCount < opts.config.minAgentLines;
      if (lowAgentOutput) signals.push("low_agent_output");

      const noReport = !executeReportExists(opts.runsDir, opts.taskId, opts.attempt);
      if (noReport) signals.push("no_execute_report");

      if (noToolCalls) signals.push("no_tool_calls");

      const abort = noGit && lowAgentOutput && noReport && noToolCalls;
      if (!abort) return { abort: false };

      return {
        abort: true,
        reason: `empty-run after ${opts.config.graceMinutes}m: ${signals.join(", ")}`,
        signals,
      };
    },
  };
}
