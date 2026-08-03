/** 与 CLI / dispatch 约定的执行器命令模板（应用层配置，非领域不变式） */
export const EXECUTOR_IDS = [
  "shell-template",
  "cursor-sdk",
  "cursor-agent",
  "opencode",
  "codex",
  "claude",
] as const;

/** shell 类 preset；`cursor-sdk` 走 {@link AGENT_FARM_EXECUTOR} / config.json `executor`，无 command-template */
export const EXECUTOR_PRESETS: Record<string, string> = {
  /** 使用仓库内 devDependency `opencode-ai`；PREFIX 用 WORKSPACE_ROOT，运行目录用 WORKSPACE（见 task-runtime-env） */
  opencode:
    'npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}',
  /**
   * Codex CLI headless：`--json` 供 farm 流解析；`--ephemeral` 避免并行会话落盘冲突；
   * `--sandbox danger-full-access` 允许写代码（比弃用的 bypass 旗标更贴合当前 CLI）。
   */
  codex:
    "codex exec --json --ephemeral --skip-git-repo-check --sandbox danger-full-access {prompt}",
  claude: "claude -p {prompt} --output-format stream-json --verbose --dangerously-skip-permissions",
  /**
   * Cursor Agent CLI（`agent` / `cursor-agent`）headless：
   * `-p` 非交互，`--force` 允许改文件，`--trust` 跳过工作区信任提示，`stream-json` 供可观测。
   */
  "cursor-agent":
    "agent -p --force --trust --output-format stream-json {prompt}",
};

/** 别名 → 正规 preset id（配置/探测用） */
export const EXECUTOR_ALIASES: Record<string, string> = {
  cursor_agent: "cursor-agent",
  agent: "cursor-agent",
  "cursor-cli": "cursor-agent",
};
