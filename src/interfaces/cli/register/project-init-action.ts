import { InitProjectUseCase, type InitProjectCommand } from "../../../application/use-cases/project/init-project.js";
import { createNodeProjectInitGateway } from "../../../infrastructure/project/node-project-init-gateway.js";
import { AGENT_FARM_SKILL_MD } from "../../../infrastructure/templates/skill-md.js";
import { AGENTS_MD_TEMPLATE, CLAUDE_MD_TEMPLATE } from "../init-markdown.js";

export type ProjectInitActionInput = Omit<InitProjectCommand, "templates">;

/** 仅在执行 `project init` 时加载：用例、网关、模板与 SKILL 正文。 */
export async function runProjectInitAction(input: ProjectInitActionInput) {
  const initProject = new InitProjectUseCase(createNodeProjectInitGateway());
  return initProject.execute({
    ...input,
    templates: {
      skillMd: AGENT_FARM_SKILL_MD,
      claudeMd: CLAUDE_MD_TEMPLATE,
      codexMd: AGENTS_MD_TEMPLATE,
    },
  });
}
