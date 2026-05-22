import type { Command } from "commander";
import { runRepoScript } from "./run-repo-script.js";

export function registerReleaseCommand(program: Command): void {
  program
    .command("release", { hidden: false })
    .description("版本发布辅助（转发至 scripts/release.mjs）")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(() => {
      runRepoScript("release.mjs", "release");
    });
}
