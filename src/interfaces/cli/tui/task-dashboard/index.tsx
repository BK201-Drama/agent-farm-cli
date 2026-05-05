import { render } from "ink";
import type { JsonMap, TaskRecord } from "../../../../domain/task.js";
import { TaskDashboard } from "./app.js";
import type { DashboardTheme } from "./helpers.js";
import { runPlainDashboard } from "./plain-runner.js";

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
};

export { TaskDashboard } from "./app.js";
export type { DashboardTheme } from "./helpers.js";

export async function runTaskDashboard(opts: RunTaskDashboardOpts): Promise<void> {
  const noTty = process.stdin.isTTY !== true || process.stdout.isTTY !== true;
  const plain = opts.plain === true || (opts.forceInk !== true && noTty);
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
  const inst = render(
    <TaskDashboard
      listTasks={opts.listTasks}
      refreshMs={opts.refreshMs}
      theme={theme}
      storageLines={opts.storageLines}
    />,
    { exitOnCtrlC: true },
  );
  await inst.waitUntilExit();
}
