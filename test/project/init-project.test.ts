import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { InitProjectUseCase } from "../../src/application/use-cases/project/init-project.js";
import { createNodeProjectInitGateway } from "../../src/infrastructure/project/node-project-init-gateway.js";

describe("InitProjectUseCase", () => {
  let dir = "";

  afterEach(() => {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    dir = "";
  });

  it("creates jsonl layout and config with force", async () => {
    dir = join(tmpdir(), `farm-init-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const uc = new InitProjectUseCase(createNodeProjectInitGateway());
    const result = await uc.execute({
      projectRoot: dir,
      skillName: "agent-farm-dispatch",
      environments: ["cursor"],
      force: true,
      workers: 2,
      storage: "jsonl",
      executorPreset: "auto",
      executorCommand: "",
      detectedExecutor: "none",
      templates: { skillMd: "# skill", claudeMd: "# c", codexMd: "# a" },
      exampleWaveUtf8: '[{"task_id":"x","dedupe_key":"x","prompt":"p"}]\n',
      healthWorkflowUtf8: "name: test-health\n",
    });
    expect(result.ok).toBe(true);
    expect(existsSync(join(dir, ".agent-farm/waves/team-handoff-min.example.json"))).toBe(true);
    expect(existsSync(join(dir, ".github/workflows/agent-farm-health.yml"))).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, ".agent-farm", "config.json"), "utf8"));
    expect(cfg.storage).toBe("jsonl");
    expect(readFileSync(join(dir, ".cursor/skills/agent-farm-dispatch/SKILL.md"), "utf8")).toContain("skill");
    expect(existsSync(join(dir, ".agent-farm/waves"))).toBe(true);
  });
});
