import type { Command } from "commander";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { createDefaultStorageContainer } from "../compose.js";
import { runTaskDashboard } from "../tui/task-dashboard/index.js";

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("终端看板：执行中任务 + 历史（Ink 全屏刷新；动画在子组件内避免顶行反复刷）")
    .alias("ui")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--refresh-ms <n>", "轮询刷新间隔（毫秒）", "900")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const listTasks = () => container.queueService.listTasks();
      await runTaskDashboard({
        listTasks,
        refreshMs: Math.max(200, Number(opts.refreshMs) || 900),
      });
    });
}
