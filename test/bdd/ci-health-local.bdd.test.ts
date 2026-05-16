import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const scriptPath = join(repoRoot, "scripts/ci-health-local.mjs");

/**
 * BDD: CI 健康巡检在本地可一条命令复现（与 GitHub Actions 精神对齐）
 *
 * Given 仓库根与 tsx 可用
 * When 执行 node scripts/ci-health-local.mjs
 * Then 退出码 0，且 doctor + insights 均对临时 jsonl 队列成功
 */
describe("BDD: ci-health-local (doctor + insights parity)", () => {
  it("runs ci-health-local script with exit 0", () => {
    expect(existsSync(scriptPath)).toBe(true);
    const r = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AGENT_FARM_STORAGE: "jsonl",
        AGENT_FARM_SKIP_OPENCODE_PROBE: "1",
      },
      encoding: "utf8",
    });
    expect(r.status, `stderr:\n${r.stderr}\nstdout:\n${r.stdout}`).toBe(0);
    expect(r.stdout).toMatch(/ci-health-local:\s*ok/i);
  });
});
