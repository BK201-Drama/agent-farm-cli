import { existsSync } from "node:fs";
import { join } from "node:path";
import { runGitCapture } from "./git-context.js";
import type { OpencodeStreamObserver } from "./run-opencode-aware-shell.js";
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
  getStreamObs: () => OpencodeStreamObserver | undefined;
}): EmptyRunMonitor {
  const graceMs = opts.config.graceMinutes * 60_000;

  return {
    check(): EmptyRunCheckResult {
      if (!opts.config.enabled) return { abort: false };

      const elapsed = Date.now() - opts.startedAtMs;
      if (elapsed < graceMs) return { abort: false };

      const signals: string[] = [];
      const noGit = !hasWorkingTreeChanges(opts.workspaceDir);
      if (noGit) signals.push("no_git_diff");

      const snap = opts.getStreamObs()?.snapshot();
      const lineCount = (snap?.linesOk ?? 0) + (snap?.linesInvalid ?? 0);
      const lowOpencode = lineCount < opts.config.minOpencodeLines;
      if (lowOpencode) signals.push("low_opencode_output");

      const noReport = !executeReportExists(opts.runsDir, opts.taskId, opts.attempt);
      if (noReport) signals.push("no_execute_report");

      const abort = noGit && lowOpencode && noReport;
      if (!abort) return { abort: false };

      return {
        abort: true,
        reason: `empty-run after ${opts.config.graceMinutes}m: ${signals.join(", ")}`,
        signals,
      };
    },
  };
}
