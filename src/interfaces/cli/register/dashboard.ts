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
    .description(
      "终端看板：执行管线 + 历史（Tab 切换 · ↑↓jk 滚动 · Enter 详情 · / 搜索 · --plain JSON 行模式）",
    )
    .alias("ui")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--refresh-ms <n>", "轮询刷新间隔（毫秒）", "900")
    .option("--plain", "非交互：每行 JSON 输出（无 TTY 时默认开启）", false)
    .option("--no-color", "禁用 ANSI 颜色", false)
    .option("--theme <name>", "终端主题：dark | light", "dark")
    .action(async (opts) => {
      const container = createDefaultStorageContainer({
        taskFile: String(opts.taskFile),
        eventFile: DEFAULT_EVENT_FILE,
        quarantineFile: DEFAULT_QUARANTINE_FILE,
      });
      const listTasks = () => container.queueService.listTasks();
      const theme = String(opts.theme).toLowerCase() === "light" ? "light" : "dark";
      await runTaskDashboard({
        listTasks,
        refreshMs: Math.max(200, Number(opts.refreshMs) || 900),
        plain: Boolean(opts.plain),
        noColor: Boolean(opts.noColor),
        theme,
      });
    });
}
