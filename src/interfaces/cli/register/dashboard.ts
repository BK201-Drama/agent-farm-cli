import type { Command } from "commander";
import { resolveQueueWorkspace } from "../../../domain/task/queue-workspace-paths.js";
import {
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_TASK_FILE,
} from "../defaults.js";
import { warnIfGlobalCliInWorkspacePackage } from "../cli-install-hint.js";
import { createDefaultStorageContainer } from "../compose.js";

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description(
      "终端看板：管线+归档高密度列（hb/topic·mode/err）·搜索含 id/prompt/topic/dedupe/status·无 TTY 默认 JSON·--ink 强制 Ink。Ink 模式默认启用备用屏幕，减少 IDE 集成终端主滚动区堆叠半截画面；可设 AGENT_FARM_DASHBOARD_ALT_SCREEN=0 关闭。Windows 默认强制 Ink 全屏清屏重绘，避免 log-update 在 Git Bash/部分终端反复堆叠；设 AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR=0 关闭。非 Windows 若遇堆叠可设 AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR=1。只要 JSON 可 --plain",
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
    .option(
      "--opencode-feed",
      "Ink 看板底部显示 OpenCode 会话推理/工具摘要（轮询 npx opencode-ai export；也可用环境变量 AGENT_FARM_DASHBOARD_OPENCODE=1）",
      false,
    )
    .option("--opencode-refresh-ms <n>", "OpenCode 摘要轮询间隔（毫秒）", "2500")
    .option(
      "--opencode-max-sessions <n>",
      "OpenCode 最多 export 的会话数（1–20；也可用 AGENT_FARM_DASHBOARD_OPENCODE_MAX_SESSIONS）",
      "3",
    )
    .action(async (opts) => {
      const { runTaskDashboard } = await import("../tui/task-dashboard/index.js");
      warnIfGlobalCliInWorkspacePackage();
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
      const envOpencode =
        process.env.AGENT_FARM_DASHBOARD_OPENCODE === "1" ||
        process.env.AGENT_FARM_DASHBOARD_OPENCODE === "true" ||
        process.env.AGENT_FARM_DASHBOARD_OPENCODE === "yes";
      const opencodeFeed = Boolean(opts.opencodeFeed) || envOpencode;
      const envMax = process.env.AGENT_FARM_DASHBOARD_OPENCODE_MAX_SESSIONS;
      const maxFromEnv = envMax != null && envMax !== "" ? Number(envMax) : NaN;
      const maxFromOpt = Number(opts.opencodeMaxSessions);
      const opencodeMaxSessions = Math.min(
        20,
        Math.max(1, Number.isFinite(maxFromEnv) ? maxFromEnv : Number.isFinite(maxFromOpt) ? maxFromOpt : 3),
      );
      const envRows = process.env.AGENT_FARM_DASHBOARD_OPENCODE_ROWS_PER_SESSION;
      const rowsFromEnv = envRows != null && envRows !== "" ? Number(envRows) : NaN;
      const opencodeRowsPerSession = Math.min(20, Math.max(1, Number.isFinite(rowsFromEnv) ? rowsFromEnv : 4));
      await runTaskDashboard({
        listTasks,
        refreshMs: Math.max(200, Number(opts.refreshMs) || 900),
        plain: Boolean(opts.plain),
        forceInk: Boolean(opts.ink),
        noColor: Boolean(opts.noColor),
        theme,
        storageLines,
        storageContext,
        queueActions: container.queueService,
        workspaceRoot: w.cwd,
        opencodeFeed,
        opencodeRefreshMs: Math.max(800, Number(opts.opencodeRefreshMs) || 2500),
        opencodeMaxSessions,
        opencodeRowsPerSession,
      });
    });
}
