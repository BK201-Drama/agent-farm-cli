import type { ContainerPorts } from "../application/contracts/container-ports.js";
import { nodeGitWorkspacePort } from "../infrastructure/git/node-git-workspace-port.js";
import { nodeProjectConfigPort } from "../infrastructure/config/node-project-config-port.js";

export type { ContainerPorts };

export function defaultContainerPorts(overrides?: Partial<ContainerPorts>): ContainerPorts {
  return {
    gitWorkspace: overrides?.gitWorkspace ?? nodeGitWorkspacePort,
    projectConfig: overrides?.projectConfig ?? nodeProjectConfigPort,
  };
}
