import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type CliInstallKind = "global" | "local" | "dev";

export type ResolvedCliInstall = {
  kind: CliInstallKind;
  /** local 时为含 package.json 的消费者项目根 */
  projectRoot?: string;
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** 根据当前 CLI 入口路径判断安装方式（global / 项目依赖 / 本仓库 dev）。 */
export function resolveCliInstall(entryUrl = import.meta.url): ResolvedCliInstall {
  const cliPath = normalizePath(realpathSync(fileURLToPath(entryUrl)));
  const marker = "/node_modules/agent-farm-cli/";
  const idx = cliPath.indexOf(marker);
  if (idx >= 0) {
    const nodeModulesDir = cliPath.slice(0, idx + "/node_modules".length);
    try {
      const globalNm = normalizePath(
        execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
      );
      if (nodeModulesDir === globalNm) {
        return { kind: "global" };
      }
    } catch {
      /* npm 不可用则按 local 处理 */
    }
    return { kind: "local", projectRoot: dirname(nodeModulesDir) };
  }
  if (/\/agent-farm-cli\/(dist|src)\//.test(cliPath)) {
    return { kind: "dev" };
  }
  return { kind: "global" };
}
