import type { GitWorkspacePort } from "./git-workspace.js";
import type { ProjectConfigPort } from "./agent-farm-project-config.js";

export type ContainerPorts = {
  gitWorkspace: GitWorkspacePort;
  projectConfig: ProjectConfigPort;
};
