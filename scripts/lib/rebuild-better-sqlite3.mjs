import { spawnSync } from "node:child_process";

export function rebuildBetterSqlite3(packageRoot) {
  const r = spawnSync("npm", ["rebuild", "better-sqlite3", "--foreground-scripts"], {
    cwd: packageRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
  });
  return r.status === 0;
}

export function shouldSkipRebuild(opts) {
  const checkRuntime = opts?.checkRuntime ?? false;
  if (process.env.AGENT_FARM_SKIP_SQLITE_REBUILD === "1") return true;
  if (checkRuntime && process.env.AGENT_FARM_SKIP_SQLITE_RUNTIME_REBUILD === "1") return true;
  return false;
}
