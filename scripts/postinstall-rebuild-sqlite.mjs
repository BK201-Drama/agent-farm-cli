#!/usr/bin/env node
/**
 * 安装后校验 better-sqlite3 能否被当前 Node 加载；失败则 `npm rebuild better-sqlite3`
 *（优先走预编译二进制，避免无 VS 的 Windows 上强制源码编译）。
 * CI 仅 jsonl：AGENT_FARM_SKIP_SQLITE_REBUILD=1
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.AGENT_FARM_SKIP_SQLITE_REBUILD === "1") {
  console.log("[agent-farm-cli] postinstall: skip better-sqlite3 (AGENT_FARM_SKIP_SQLITE_REBUILD=1)");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const marker = join(root, "node_modules", "better-sqlite3", "package.json");
if (!existsSync(marker)) {
  console.log("[agent-farm-cli] postinstall: better-sqlite3 not present, skip");
  process.exit(0);
}

const mod = process.versions.modules;
const require = createRequire(join(root, "package.json"));

function tryLoad() {
  try {
    require("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

if (tryLoad()) {
  console.log(
    `[agent-farm-cli] postinstall: better-sqlite3 ok (Node ${process.version}, NODE_MODULE_VERSION=${mod})`,
  );
  process.exit(0);
}

console.warn(
  `[agent-farm-cli] postinstall: better-sqlite3 load failed for Node ${process.version} (NODE_MODULE_VERSION=${mod}), running npm rebuild…`,
);
const r = spawnSync("npm", ["rebuild", "better-sqlite3", "--foreground-scripts"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

if (r.status !== 0) {
  console.warn(
    "[agent-farm-cli] postinstall: rebuild failed。可改用 AGENT_FARM_STORAGE=jsonl，或安装 VS C++ 构建工具后执行: npm rebuild better-sqlite3",
  );
  process.exit(0);
}

if (tryLoad()) {
  console.log("[agent-farm-cli] postinstall: better-sqlite3 rebuild ok");
} else {
  console.warn(
    "[agent-farm-cli] postinstall: rebuild 后仍无法加载 better-sqlite3。请切换与安装该包时一致的 Node，或 npm rebuild better-sqlite3 / 使用 jsonl 存储。",
  );
}
process.exit(0);
