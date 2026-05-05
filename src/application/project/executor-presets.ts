/** 与 CLI / dispatch 约定的执行器命令模板（应用层配置，非领域不变式） */
export const EXECUTOR_PRESETS: Record<string, string> = {
  opencode: "opencode run --dir . --dangerously-skip-permissions {prompt}",
  codex: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox {prompt}",
  claude: "claude -p {prompt} --dangerously-skip-permissions",
};
