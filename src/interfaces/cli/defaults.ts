import { join } from "node:path";

export const DEFAULT_STORAGE = (process.env.AGENT_FARM_STORAGE ?? "sqlite") as "jsonl" | "sqlite";

const cwd = (): string => process.cwd();

export const DEFAULT_TASK_FILE = join(cwd(), ".agent-farm", "queue", "tasks.jsonl");
export const DEFAULT_EVENT_FILE = join(cwd(), ".agent-farm", "queue", "events.jsonl");
export const DEFAULT_QUARANTINE_FILE = join(cwd(), ".agent-farm", "queue", "quarantine_tasks.jsonl");
export const DEFAULT_DB_FILE = join(cwd(), ".agent-farm", "queue", "agent_farm.db");

export { EXECUTOR_PRESETS } from "../../application/use-cases/project/executor-presets.js";

/** 与 {@link resolveQueueWorkspace} 对齐；worker 未传 `--runs-dir` 时默认用项目下 `.agent-farm/runs`。 */
export const DEFAULT_RUNS_DIR = join(cwd(), ".agent-farm", "runs");
