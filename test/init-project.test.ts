import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { InitProjectUseCase } from "../src/application/use-cases/project/init-project.js";

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
    const uc = new InitProjectUseCase();
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
    });
    expect(result.ok).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, ".agent-farm", "config.json"), "utf8"));
    expect(cfg.storage).toBe("jsonl");
    expect(readFileSync(join(dir, ".cursor/skills/agent-farm-dispatch/SKILL.md"), "utf8")).toContain("skill");
  });
});
