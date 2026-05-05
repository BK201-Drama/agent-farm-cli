import { createRequire } from "node:module";

export type BetterSqlite3Probe = { ok: true } | { ok: false; hint: string };

/** 尝试加载 better-sqlite3，用于 doctor / 启动前提示（不替代 npm rebuild）。 */
export function probeBetterSqlite3(): BetterSqlite3Probe {
  try {
    const require = createRequire(import.meta.url);
    require("better-sqlite3");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      hint: `better-sqlite3 无法加载: ${msg}。请在当前 shell 的 Node 版本下执行 npm rebuild better-sqlite3，或 nvm use 到与编译时一致的 Node（NODE_MODULE_VERSION 需一致）。`,
    };
  }
}
