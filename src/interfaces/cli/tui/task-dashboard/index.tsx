import { render } from "ink";
import type { TaskRecord } from "../../../../domain/task.js";
import { TaskDashboard } from "./app.js";
import type { DashboardTheme } from "./helpers.js";
import { runPlainDashboard } from "./plain-runner.js";

export type RunTaskDashboardOpts = {
  listTasks: () => Promise<TaskRecord[]>;
  refreshMs: number;
  /** 强制 JSON 行模式（也会在没有 stdin/stdout TTY 时自动启用） */
  plain?: boolean;
  /** 设置 NO_COLOR，禁用 ANSI 颜色 */
  noColor?: boolean;
  theme?: DashboardTheme;
};

export { TaskDashboard } from "./app.js";
export type { DashboardTheme } from "./helpers.js";

export async function runTaskDashboard(opts: RunTaskDashboardOpts): Promise<void> {
  const plain =
    opts.plain === true || process.stdin.isTTY !== true || process.stdout.isTTY !== true;
  if (plain) {
    await runPlainDashboard({ listTasks: opts.listTasks, refreshMs: opts.refreshMs });
    return;
  }
  if (opts.noColor === true) {
    process.env.NO_COLOR = "1";
  }
  const theme: DashboardTheme = opts.theme === "light" ? "light" : "dark";
  const inst = render(
    <TaskDashboard listTasks={opts.listTasks} refreshMs={opts.refreshMs} theme={theme} />,
    { exitOnCtrlC: true },
  );
  await inst.waitUntilExit();
}
