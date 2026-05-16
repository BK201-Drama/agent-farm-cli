import type { Command } from "commander";
import { registerDashboardCommand } from "./dashboard.js";
import { registerDemoCommands } from "./demo.js";
import { registerDoctorCommand } from "./doctor.js";
import { registerInsightsCommand } from "./insights.js";
import { registerLoginCommand } from "./login.js";
import { registerProjectCommands } from "./project.js";
import { registerQueueCommands } from "./queue/index.js";
import { registerSkillCommands } from "./skill.js";
import { registerControlPlaneCommands } from "./control-plane.js";
import { registerStuckCommands } from "./stuck.js";
import { registerStatusCommand } from "./status.js";
import { registerWorkerCommand } from "./worker.js";

export function registerAllCommands(program: Command): void {
  registerSkillCommands(program);
  registerDemoCommands(program);
  registerDashboardCommand(program);
  registerProjectCommands(program);
  registerQueueCommands(program);
  registerWorkerCommand(program);
  registerInsightsCommand(program);
  registerDoctorCommand(program);
  registerStuckCommands(program);
  registerControlPlaneCommands(program);
  registerStatusCommand(program);
  registerLoginCommand(program);
}
