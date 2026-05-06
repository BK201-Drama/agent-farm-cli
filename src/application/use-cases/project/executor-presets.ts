/** 与 CLI / dispatch 约定的执行器命令模板（应用层配置，非领域不变式） */
export const EXECUTOR_PRESETS: Record<string, string> = {
  /** 使用仓库内 devDependency `opencode-ai`；依赖 worker 子进程中的 AGENT_FARM_WORKSPACE 与 PATH（见 task-runtime-env） */
  opencode:
    'npx --prefix="$AGENT_FARM_WORKSPACE" opencode-ai run --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}',
  codex: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox {prompt}",
  claude: "claude -p {prompt} --dangerously-skip-permissions",
};
