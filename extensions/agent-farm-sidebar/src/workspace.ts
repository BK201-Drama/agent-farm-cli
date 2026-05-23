import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";

function hasAgentFarmDir(root: string): boolean {
  return existsSync(join(root, ".agent-farm"));
}

/** 解析 agent-farm 工作区根：配置 > 含 .agent-farm 的 folder > 第一个 folder。 */
export function resolveAgentFarmWorkspaceRoot(): string | undefined {
  const cfg = vscode.workspace.getConfiguration("agentFarm");
  const configured = cfg.get<string>("workspaceFolder")?.trim();
  if (configured && hasAgentFarmDir(configured)) return configured;

  const folders = vscode.workspace.workspaceFolders ?? [];
  const withFarm = folders.filter((f) => hasAgentFarmDir(f.uri.fsPath));
  if (withFarm.length === 1) return withFarm[0]!.uri.fsPath;
  if (withFarm.length > 1) return withFarm[0]!.uri.fsPath;

  return folders[0]?.uri.fsPath;
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
}

export function healthMatchesWorkspace(queueCwd: string | undefined, workspaceRoot: string | undefined): boolean {
  if (!queueCwd || !workspaceRoot) return false;
  return normalizePath(queueCwd) === normalizePath(workspaceRoot);
}
