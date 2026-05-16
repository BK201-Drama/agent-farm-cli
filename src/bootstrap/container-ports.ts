import type { GitWorkspacePort } from "../application/contracts/git-workspace.js";
import type { ProjectConfigPort } from "../application/contracts/agent-farm-project-config.js";
import { nodeGitWorkspacePort } from "../infrastructure/git/node-git-workspace-port.js";
import { nodeProjectConfigPort } from "../infrastructure/config/node-project-config-port.js";

export type ContainerPorts = {
  gitWorkspace: GitWorkspacePort;
  projectConfig: ProjectConfigPort;
};

export function defaultContainerPorts(overrides?: Partial<ContainerPorts>): ContainerPorts {
  return {
    gitWorkspace: overrides?.gitWorkspace ?? nodeGitWorkspacePort,
    projectConfig: overrides?.projectConfig ?? nodeProjectConfigPort,
  };
}
