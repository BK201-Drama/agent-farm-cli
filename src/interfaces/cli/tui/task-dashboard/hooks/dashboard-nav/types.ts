import type { DashboardQueueCommands } from "../../../../../../application/contracts/dashboard-queue-commands.js";
import type { TaskRecord } from "../../../../../../domain/task.js";
import type { DashboardPanel, ViewportNav } from "../../types.js";

export type DashboardNavState = {
  active: DashboardPanel;
  pipeNav: ViewportNav;
  histNav: ViewportNav;
  searchMode: boolean;
  searchQuery: string;
  detailTask: TaskRecord | null;
  filteredPipeline: TaskRecord[];
  filteredHistory: TaskRecord[];
  actionErr: string | null;
};

export type UseDashboardNavOpts = {
  keyboardInput: boolean;
  err: string | null;
  pipeline: TaskRecord[];
  history: TaskRecord[];
  queueActions?: DashboardQueueCommands;
  /** 与 TaskBoardSection viewport 一致，随终端高度收缩 */
  viewportPipe: number;
  viewportHist: number;
};
