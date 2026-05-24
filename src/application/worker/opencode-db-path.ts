import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { sanitizeTaskIdForPath } from "../../infrastructure/git/agent-farm-worktree.js";

/** 每条任务独立 OpenCode SQLite 文件，避免多进程争用同一 WAL（见 OPENCODE_DB）。 */
export function resolveOpencodeDbPathForTask(workspaceRoot: string, taskId: string): string {
  const safe = sanitizeTaskIdForPath(taskId);
  return resolve(join(workspaceRoot, ".agent-farm", "opencode-db", `${safe}.db`));
}

/** 每条任务独立 Claude Code 配置目录，避免多进程争用同一状态文件。 */
export function resolveClaudeConfigDirForTask(workspaceRoot: string, taskId: string): string {
  const safe = sanitizeTaskIdForPath(taskId);
  return resolve(join(workspaceRoot, ".agent-farm", "claude-config", safe));
}

export function ensureParentDirForDbFile(dbFileAbsolutePath: string): void {
  mkdirSync(dirname(dbFileAbsolutePath), { recursive: true });
}
