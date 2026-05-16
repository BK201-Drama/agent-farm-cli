import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const script = join(repoRoot, "scripts/onboarding-15min-check.mjs");
const docPath = join(repoRoot, "docs/user-guide/zh/onboarding-15min.md");
const m3Wave = join(repoRoot, "examples/waves/m3-product-onboarding.json");

/**
 * BDD: M3 十五分钟陌生人路径（自动 + 文档契约）
 */
describe("BDD: onboarding 15min", () => {
  it("Given onboarding 文档 When 读取 Then 含 farm:onboarding:15min 与侧栏步骤", () => {
    expect(existsSync(docPath)).toBe(true);
    const text = readFileSync(docPath, "utf8");
    expect(text).toMatch(/farm:onboarding:15min/);
    expect(text).toMatch(/control-plane|侧栏/i);
    expect(text).toMatch(/worker/i);
  });

  it("Given m3 wave 文件 When 解析 JSON Then 为合法数组且含 onboarding 任务", () => {
    expect(existsSync(m3Wave)).toBe(true);
    const items = JSON.parse(readFileSync(m3Wave, "utf8")) as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const first = items[0] as { task_id?: string; acceptance_criteria?: string };
    expect(String(first.task_id ?? "")).toMatch(/onboarding/i);
    expect(String(first.acceptance_criteria ?? "")).toMatch(/onboarding-15min/i);
  });

  it("Given 已 build When node scripts/onboarding-15min-check.mjs Then exit 0 且输出 OK", () => {
    const r = spawnSync(process.execPath, [script], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
    });
    expect(r.status, `${r.stderr}\n${r.stdout}`).toBe(0);
    expect(r.stdout).toMatch(/onboarding-15min-check: OK/);
    expect(r.stdout).toMatch(/✓ validate:waves/);
    expect(r.stdout).toMatch(/✓ embed-minimal/);
  }, 120_000);

  it("Given npm script When farm:onboarding:15min Then 与直接 node 脚本等价成功", () => {
    const r = spawnSync("npm", ["run", "farm:onboarding:15min"], {
      cwd: repoRoot,
      shell: true,
      encoding: "utf8",
      env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
    });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/onboarding-15min-check: OK/);
  }, 120_000);
});
