import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const embedExample = join(repoRoot, "examples/embed-minimal/run.mjs");
const stabilityDoc = join(repoRoot, "docs/embed-api-stability.md");

/**
 * BDD: 15 分钟链 — 个人路径 + 嵌入面 + onboarding 脚本
 */
describe("BDD: onboarding 15min chain", () => {
  it("Given 个人 demo+doctor 已通过 When embed-minimal + onboarding 脚本 Then 均成功", () => {
    const embed = spawnSync(process.execPath, [embedExample], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(embed.status).toBe(0);
    const payload = JSON.parse(embed.stdout) as { ok?: boolean; health?: { service?: string } };
    expect(payload.ok).toBe(true);
    expect(payload.health?.service).toBe("agent-farm-control-plane");

    const onboard = spawnSync(process.execPath, [join(repoRoot, "scripts/onboarding-15min-check.mjs")], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
    });
    expect(onboard.status).toBe(0);
    expect(onboard.stdout).toMatch(/onboarding-15min-check: OK/);
  }, 120_000);

  it("Given embed-api-stability 文档 When 读取 Then 列出 core export 与 semver", () => {
    expect(existsSync(stabilityDoc)).toBe(true);
    const text = readFileSync(stabilityDoc, "utf8");
    expect(text).toMatch(/agent-farm-cli\/core/);
    expect(text).toMatch(/semver|Semver/i);
    expect(text).toMatch(/ControlPlaneService/);
  });
});
