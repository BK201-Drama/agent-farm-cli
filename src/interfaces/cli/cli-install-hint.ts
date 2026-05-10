import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * 在「本仓库根」运行 dashboard 时，若入口脚本不在当前工作区树下（常见于全局 `agent-farm` / nvm 全局包），向 stderr 给出一行提示，减少 better-sqlite3 ABI 等与混用安装相关的问题。
 */
export function warnIfGlobalCliInWorkspacePackage(): void {
  try {
    const pkgPath = join(process.cwd(), "package.json");
    if (!existsSync(pkgPath)) return;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
    if (pkg.name !== "agent-farm-cli") return;

    const script = process.argv[1];
    if (script == null || script.length === 0) return;

    const cwd = resolve(process.cwd());
    const entry = resolve(script);
    const c = cwd.endsWith(sep) ? cwd : cwd + sep;
    if (entry.toLowerCase().startsWith(c.toLowerCase())) {
      return;
    }

    process.stderr.write(
      "[agent-farm] 当前目录是 agent-farm-cli 源码仓库，但进程入口不在该目录树下（多为全局安装的 CLI）。建议使用本仓库构建入口以避免依赖/ABI 混用，例如：npm run farm:dashboard 或 node dist/interfaces/cli/index.js dashboard。\n",
    );
  } catch {
    /* best-effort only */
  }
}
