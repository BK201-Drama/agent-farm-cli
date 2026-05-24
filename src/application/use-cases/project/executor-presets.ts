/** 与 CLI / dispatch 约定的执行器命令模板（应用层配置，非领域不变式） */
export const EXECUTOR_IDS = ["shell-template", "cursor-sdk", "opencode", "codex", "claude"] as const;

/** shell 类 preset；`cursor-sdk` 走 {@link AGENT_FARM_EXECUTOR} / config.json `executor`，无 command-template */
export const EXECUTOR_PRESETS: Record<string, string> = {
  /** 使用仓库内 devDependency `opencode-ai`；PREFIX 用 WORKSPACE_ROOT，运行目录用 WORKSPACE（见 task-runtime-env） */
  opencode:
    'npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}',
  codex: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox {prompt}",
  claude: "claude -p {prompt} --output-format stream-json --dangerously-skip-permissions",
};
