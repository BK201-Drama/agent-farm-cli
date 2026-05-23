import { spawnSync } from "node:child_process";
import { GIT_DIFF_CAP, GIT_DIFF_NAME_STATUS_CAP } from "./worker-output-limits.js";

export type GitTemplateFields = {
  git_diff: string;
  git_diff_name_status: string;
};

function truncateWithMarker(value: string, cap: number): string {
  if (value.length <= cap) return value;
  const marker = "\n\n[... truncated ...]";
  return value.slice(0, cap - marker.length) + marker;
}

export function runGitCapture(workspace: string, args: string[]): { ok: true; stdout: string } | { ok: false } {
  const r = spawnSync("git", ["-C", workspace, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
  if (r.status !== 0) return { ok: false };
  return { ok: true, stdout: r.stdout };
}

function resolveDefaultBranchRef(workspace: string): string | null {
  const r = runGitCapture(workspace, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (!r.ok) return null;
  return r.stdout.trim() || null;
}

function collectGitDiff(workspace: string): string {
  const remoteRef = resolveDefaultBranchRef(workspace);
  if (remoteRef) {
    const r = runGitCapture(workspace, ["diff", `${remoteRef}...HEAD`]);
    if (r.ok) return truncateWithMarker(r.stdout.trimEnd(), GIT_DIFF_CAP);
  }
  const fallback = runGitCapture(workspace, ["diff", "HEAD~1"]);
  if (fallback.ok) return truncateWithMarker(fallback.stdout.trimEnd(), GIT_DIFF_CAP);
  return "";
}

function collectGitDiffNameStatus(workspace: string): string {
  const remoteRef = resolveDefaultBranchRef(workspace);
  if (remoteRef) {
    const r = runGitCapture(workspace, ["diff", "--name-status", `${remoteRef}...HEAD`]);
    if (r.ok) return truncateWithMarker(r.stdout.trimEnd(), GIT_DIFF_NAME_STATUS_CAP);
  }
  const fallback = runGitCapture(workspace, ["diff", "--name-status", "HEAD~1"]);
  if (fallback.ok) return truncateWithMarker(fallback.stdout.trimEnd(), GIT_DIFF_NAME_STATUS_CAP);
  return "";
}

export function collectGitTemplateFields(workspace: string): GitTemplateFields {
  return {
    git_diff: collectGitDiff(workspace),
    git_diff_name_status: collectGitDiffNameStatus(workspace),
  };
}

/** 工作区相对 HEAD 的增删行合计（用于大 diff ai-review 门控）。 */
export function countWorkingTreeDiffLines(workspace: string): number {
  let total = 0;
  for (const args of [
    ["diff", "--shortstat"],
    ["diff", "--cached", "--shortstat"],
  ] as const) {
    const r = runGitCapture(workspace, [...args]);
    if (!r.ok) continue;
    const ins = r.stdout.match(/(\d+)\s+insertion/);
    const del = r.stdout.match(/(\d+)\s+deletion/);
    total += (ins ? Number(ins[1]) : 0) + (del ? Number(del[1]) : 0);
  }
  return total;
}
