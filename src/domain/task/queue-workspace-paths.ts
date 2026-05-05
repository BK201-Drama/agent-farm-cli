import { join } from "node:path";

export type AgentFarmStorageKind = "sqlite" | "jsonl";

/** 与 CLI / compose 对齐的队列工作区路径（按 cwd 隔离多项目）。 */
export type ResolvedQueueWorkspace = {
  cwd: string;
  storage: AgentFarmStorageKind;
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
  dbFile: string;
  runsDirDefault: string;
};

export function resolveAgentFarmStorageFromEnv(): AgentFarmStorageKind {
  const raw = String(process.env.AGENT_FARM_STORAGE ?? "sqlite").toLowerCase();
  return raw === "jsonl" ? "jsonl" : "sqlite";
}

export function resolveQueueWorkspace(cwd: string = process.cwd()): ResolvedQueueWorkspace {
  const storage = resolveAgentFarmStorageFromEnv();
  const qdir = join(cwd, ".agent-farm", "queue");
  return {
    cwd,
    storage,
    taskFile: join(qdir, "tasks.jsonl"),
    eventFile: join(qdir, "events.jsonl"),
    quarantineFile: join(qdir, "quarantine_tasks.jsonl"),
    dbFile: join(qdir, "agent_farm.db"),
    runsDirDefault: join(cwd, ".agent-farm", "runs"),
  };
}
