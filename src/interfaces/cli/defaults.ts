import { join } from "node:path";
import { tmpdir } from "node:os";

export const DEFAULT_STORAGE = (process.env.AGENT_FARM_STORAGE ?? "sqlite") as "jsonl" | "sqlite";

const cwd = (): string => process.cwd();

export const DEFAULT_TASK_FILE = join(cwd(), ".agent-farm", "queue", "tasks.jsonl");
export const DEFAULT_EVENT_FILE = join(cwd(), ".agent-farm", "queue", "events.jsonl");
export const DEFAULT_QUARANTINE_FILE = join(cwd(), ".agent-farm", "queue", "quarantine_tasks.jsonl");
export const DEFAULT_DB_FILE = join(cwd(), ".agent-farm", "queue", "agent_farm.db");

export const EXECUTOR_PRESETS: Record<string, string> = {
  opencode: "opencode run --dir . --dangerously-skip-permissions {prompt}",
  codex: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox {prompt}",
  claude: "claude -p {prompt} --dangerously-skip-permissions",
};

export const DEFAULT_RUNS_DIR = join(tmpdir(), "agent-farm-runs");
