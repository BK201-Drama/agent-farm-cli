import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** 将 `agent-farm <subcommand> …` 之后的参数原样转发给 scripts/*.mjs */
export function runRepoScript(scriptName: string, subcommand: string): void {
  const script = join(REPO_ROOT, "scripts", scriptName);
  if (!existsSync(script)) {
    throw new Error(`脚本未找到: ${script}`);
  }
  const idx = process.argv.findIndex((a) => a === subcommand);
  const rest = idx >= 0 ? process.argv.slice(idx + 1) : [];
  const r = spawnSync(process.execPath, [script, ...rest], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}
