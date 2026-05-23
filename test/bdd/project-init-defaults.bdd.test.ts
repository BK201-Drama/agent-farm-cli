import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const distCli = join(repoRoot, "dist/interfaces/cli/index.js");
const tsx = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const srcCli = join(repoRoot, "src/interfaces/cli/index.ts");

function runInit(targetDir: string, extraArgs: string[] = []) {
  const useDist = existsSync(distCli);
  const argv = useDist
    ? [distCli, "project", "init", "--target-dir", targetDir, "--no-interactive", "--storage", "jsonl", ...extraArgs]
    : [
        tsx,
        srcCli,
        "project",
        "init",
        "--target-dir",
        targetDir,
        "--no-interactive",
        "--storage",
        "jsonl",
        ...extraArgs,
      ];
  return spawnSync(process.execPath, argv, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, AGENT_FARM_SKIP_SQLITE_REBUILD: "1" },
  });
}

/**
 * BDD: project init 默认写入团队/CI 上手产物
 */
describe("BDD: project init defaults (team + CI)", () => {
  let dir = "";

  afterEach(() => {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      dir = "";
    }
  });

  it("Given 空目录 When project init Then 写入 example wave 与 health workflow", () => {
    dir = mkdtempSync(join(tmpdir(), "af-bdd-init-"));
    const r = runInit(dir, ["--force", "--environments", "cursor"]);
    expect(r.status, `${r.stderr}${r.stdout}`).toBe(0);
    expect(existsSync(join(dir, ".agent-farm/waves/team-handoff-min.example.json"))).toBe(true);
    expect(existsSync(join(dir, ".github/workflows/agent-farm-health.yml"))).toBe(true);
  });

  it("Given --skip-example-wave --skip-health-workflow When init Then 不写入对应文件", () => {
    dir = mkdtempSync(join(tmpdir(), "af-bdd-init-skip-"));
    const r = runInit(dir, ["--force", "--environments", "cursor", "--skip-example-wave", "--skip-health-workflow"]);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, ".agent-farm/waves/team-handoff-min.example.json"))).toBe(false);
    expect(existsSync(join(dir, ".github/workflows/agent-farm-health.yml"))).toBe(false);
  });
});
