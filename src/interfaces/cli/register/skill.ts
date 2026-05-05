import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { AGENT_FARM_SKILL_MD } from "../../../infrastructure/templates/skill-template.js";
import { print } from "../cli-print.js";

export function registerSkillCommands(program: Command): void {
  const skill = program.command("skill");
  skill
    .command("install")
    .option("--target-dir <path>", "project root for skill install", process.cwd())
    .option("--skill-name <name>", "skill folder name", "agent-farm-dispatch")
    .option("--force", "overwrite existing SKILL.md", false)
    .action(async (opts) => {
      const projectRoot = resolve(String(opts.targetDir));
      const skillDir = resolve(projectRoot, ".cursor/skills", String(opts.skillName));
      const skillPath = resolve(skillDir, "SKILL.md");
      await mkdir(skillDir, { recursive: true });
      if (!opts.force) {
        try {
          await access(skillPath, constants.F_OK);
          throw new Error(`skill already exists: ${skillPath} (use --force to overwrite)`);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("skill already exists:")) {
            throw err;
          }
        }
      }
      await writeFile(skillPath, AGENT_FARM_SKILL_MD, "utf8");
      print({ ok: true, skill_path: skillPath });
    });
}
