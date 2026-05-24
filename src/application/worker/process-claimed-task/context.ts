import type { IsoClock } from "../../../domain/ports/clock.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";
import type { ShellRunner } from "../../../domain/ports/shell-runner.js";
import type { JsonMap } from "../../../domain/task.js";
import type { ClaimedTaskCommands } from "../../contracts/claimed-task-commands.js";
import type { TemplateContext } from "../command-template.js";
import type { ResolvedEmptyRunConfig } from "../empty-run-config.js";
import type { AgentFarmProjectConfig } from "../../contracts/agent-farm-project-config.js";

export type ClaimedTaskShellContext = {
  task: JsonMap;
  taskId: string;
  taskAttempt: number;
  runsDir: string;
  taskWorkspace: string;
  emptyRunConfig: ResolvedEmptyRunConfig;
  projectConfig: AgentFarmProjectConfig | null;
  tplCtx: () => TemplateContext;
  env: NodeJS.ProcessEnv;
  heartbeat: () => Promise<void>;
  runShell: ShellRunner;
  opencodeJsonEvents: boolean;
  claudeJsonEvents: boolean;
  taskCommands: ClaimedTaskCommands;
  eventRepo: EventRepository;
  clock: IsoClock;
};
