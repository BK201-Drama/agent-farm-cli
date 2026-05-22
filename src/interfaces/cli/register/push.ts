import type { Command } from "commander";
import { runRepoScript } from "./run-repo-script.js";

export function registerPushCommand(program: Command): void {
  program
    .command("push", { hidden: false })
    .description("仓库推送辅助（转发至 scripts/push.mjs）")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(() => {
      runRepoScript("push.mjs", "push");
    });
}
