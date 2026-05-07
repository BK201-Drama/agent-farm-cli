import { render } from "ink";
import type { JsonMap, TaskRecord } from "../../../../domain/task.js";
import { TaskDashboard } from "./app.js";
import type { DashboardTheme } from "./helpers.js";
import { runPlainDashboard } from "./plain-runner.js";
import type { DashboardQueueCommands } from "../../../../application/contracts/dashboard-queue-commands.js";

export type RunTaskDashboardOpts = {
  listTasks: () => Promise<TaskRecord[]>;
  refreshMs: number;
  /** 强制 JSON 行模式（也会在没有 stdin/stdout TTY 时自动启用，除非 forceInk） */
  plain?: boolean;
  /** 无 stdin/stdout TTY 时也启动 Ink（否则默认 plain JSON，常见于 IDE 集成终端/管道） */
  forceInk?: boolean;
  /** 设置 NO_COLOR，禁用 ANSI 颜色 */
  noColor?: boolean;
  theme?: DashboardTheme;
  /** Ink 顶栏：队列根路径提示 */
  storageLines?: string[];
  /** plain 模式每行 JSON 附带 `queue_workspace` */
  storageContext?: JsonMap;
  /** 队列操作回调（可选，不传则看板只读） */
  queueActions?: DashboardQueueCommands;
  /** 与 resolveQueueWorkspace 的 cwd 对齐，用于 OpenCode session 过滤 */
  workspaceRoot?: string;
  /** 显示 OpenCode 推理/工具摘要（需本机 npx opencode-ai 可用） */
  opencodeFeed?: boolean;
  opencodeRefreshMs?: number;
};

export { TaskDashboard } from "./app.js";
export type { DashboardTheme } from "./helpers.js";

/** 进入备用屏幕缓冲区，避免 VS Code/Cursor 等集成终端把每次 Ink 重绘都追加进主滚动区（日志里一堆半截画面）。 */
const ALT_SCREEN_ENTER = "\u001b[?1049h\u001b[H";
const ALT_SCREEN_LEAVE = "\u001b[?1049l";

function shouldUseAlternateScreen(): boolean {
  if (process.env.AGENT_FARM_DASHBOARD_ALT_SCREEN === "0" || process.env.AGENT_FARM_DASHBOARD_ALT_SCREEN === "false") {
    return false;
  }
  return true;
}

export async function runTaskDashboard(opts: RunTaskDashboardOpts): Promise<void> {
  const noTty = process.stdin.isTTY !== true || process.stdout.isTTY !== true;
  const envWantsPlain = (() => {
    const v = process.env.AGENT_FARM_DASHBOARD_PLAIN;
    return v === "1" || v === "true" || v === "yes";
  })();
  /** --ink 优先于环境变量，避免误配时无法强制 Ink */
  const envPlain = envWantsPlain && opts.forceInk !== true;
  const plain = opts.plain === true || envPlain || (opts.forceInk !== true && noTty);
  if (plain) {
    await runPlainDashboard({
      listTasks: opts.listTasks,
      refreshMs: opts.refreshMs,
      storageContext: opts.storageContext,
    });
    return;
  }
  if (opts.noColor === true) {
    process.env.NO_COLOR = "1";
  }
  const theme: DashboardTheme = opts.theme === "light" ? "light" : "dark";

  let altEntered = false;
  try {
    if (process.stdout.isTTY === true && shouldUseAlternateScreen()) {
      process.stdout.write(ALT_SCREEN_ENTER);
      altEntered = true;
    }

    const inst = render(
      <TaskDashboard
        listTasks={opts.listTasks}
        refreshMs={opts.refreshMs}
        theme={theme}
        storageLines={opts.storageLines}
        queueActions={opts.queueActions}
        workspaceRoot={opts.workspaceRoot ?? process.cwd()}
        opencodeFeed={opts.opencodeFeed === true}
        opencodeRefreshMs={opts.opencodeRefreshMs}
      />,
      { exitOnCtrlC: true },
    );
    await inst.waitUntilExit();
  } finally {
    if (altEntered) {
      process.stdout.write(ALT_SCREEN_LEAVE);
    }
  }
}
