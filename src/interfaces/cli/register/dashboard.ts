import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
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
      "终端看板：管线+归档高密度列（hb/topic·mode/err）·搜索含 id/prompt/topic/dedupe/status·无 TTY 默认 JSON·--ink 强制 Ink",
    )
    .alias("ui")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--refresh-ms <n>", "轮询刷新间隔（毫秒）", "900")
    .option(
      "--ink",
      "无 stdin/stdout TTY 时也启动 Ink 全屏看板（否则默认每行 JSON，适合 IDE 集成终端）",
      false,
    )
    .option("--plain", "非交互：每行 JSON 输出（无 TTY 时默认开启；与 --ink 同时指定时以 plain 为准）", false)
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
      const w = resolveQueueWorkspace(process.cwd());
      const storageLines = [
        `cwd: ${w.cwd}`,
        `storage: ${w.storage} · ${w.storage === "sqlite" ? w.dbFile : w.taskFile}`,
      ];
      const storageContext = {
        cwd: w.cwd,
        storage: w.storage,
        db_file: w.dbFile,
        task_file: w.taskFile,
        event_file: w.eventFile,
        quarantine_file: w.quarantineFile,
        runs_dir_default: w.runsDirDefault,
      };
      await runTaskDashboard({
        listTasks,
        refreshMs: Math.max(200, Number(opts.refreshMs) || 900),
        plain: Boolean(opts.plain),
        forceInk: Boolean(opts.ink),
        noColor: Boolean(opts.noColor),
        theme,
        storageLines,
        storageContext,
      });
    });
}
