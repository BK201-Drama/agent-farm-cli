import type { Command } from "commander";
import { runRepoScript } from "./run-repo-script.js";

export function registerCommitCommand(program: Command): void {
  program
    .command("commit", { hidden: false })
    .description("仓库提交辅助（转发至 scripts/commit.mjs）")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(() => {
      runRepoScript("commit.mjs", "commit");
    });
}
