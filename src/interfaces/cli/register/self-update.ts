import type { Command } from "commander";
import { runSelfUpdate } from "../../../application/use-cases/self-update/run-self-update.js";
import type { CliInstallKind } from "../../../infrastructure/npm/resolve-cli-install.js";
import { print } from "../print.js";
import { readCliPackageVersion } from "../version.js";

export function registerSelfUpdateCommand(program: Command): void {
  program
    .command("self-update")
    .description("检查并从 npm 安装 agent-farm-cli 最新版（global 或当前项目的 node_modules）")
    .option("--check", "仅检查是否有新版本，不安装", false)
    .option("-y, --yes", "确认安装（非 check 模式必需）", false)
    .option("--global", "强制 npm install -g", false)
    .option("--local", "强制在检测到 node_modules 的项目根安装", false)
    .option("--tag <tag>", "npm dist-tag 或版本范围", "latest")
    .option("--brief", "额外将摘要打印到 stderr", false)
    .action(async (opts) => {
      let installKind: CliInstallKind | undefined;
      if (opts.global && opts.local) {
        print({ ok: false, error: "不能同时指定 --global 与 --local" });
        process.exit(1);
      }
      if (opts.global) installKind = "global";
      if (opts.local) installKind = "local";

      const result = await runSelfUpdate({
        currentVersion: readCliPackageVersion(),
        checkOnly: Boolean(opts.check),
        yes: Boolean(opts.yes),
        installKind,
        tag: String(opts.tag),
        brief: Boolean(opts.brief),
        cliEntryUrl: import.meta.url,
      });

      print(result);
      if (!result.ok) process.exit(1);
      if (opts.check && result.update_available) process.exit(2);
    });
}

/** `AGENT_FARM_AUTO_UPDATE=1|check` 时在其它子命令前执行。 */
export async function maybeAutoSelfUpdateFromEnv(argv: string[]): Promise<void> {
  const raw = process.env.AGENT_FARM_AUTO_UPDATE?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "false" || raw === "off") return;
  if (argv.some((a) => a === "self-update" || a.endsWith("self-update"))) return;

  const checkOnly = raw === "check";
  const yes = raw === "1" || raw === "true" || raw === "yes" || raw === "on";

  if (!checkOnly && !yes) return;

  const result = await runSelfUpdate({
    currentVersion: readCliPackageVersion(),
    checkOnly,
    yes,
    brief: true,
    cliEntryUrl: import.meta.url,
  });

  if (!result.ok && !checkOnly) {
    process.stderr.write(`[agent-farm] 自动更新失败：${result.message}\n`);
  }
}
