import type { Command } from "commander";
import { registerDashboardCommand } from "./dashboard.js";
import { registerDoctorCommand } from "./doctor.js";
import { registerInsightsCommand } from "./insights.js";
import { registerProjectCommands } from "./project.js";
import { registerQueueCommands } from "./queue.js";
import { registerSkillCommands } from "./skill.js";
import { registerWorkerCommand } from "./worker.js";

export function registerAllCommands(program: Command): void {
  registerSkillCommands(program);
  registerDashboardCommand(program);
  registerProjectCommands(program);
  registerQueueCommands(program);
  registerWorkerCommand(program);
  registerInsightsCommand(program);
  registerDoctorCommand(program);
}
