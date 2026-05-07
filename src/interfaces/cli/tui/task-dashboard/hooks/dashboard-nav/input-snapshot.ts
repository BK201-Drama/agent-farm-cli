import type { TaskRecord } from "../../../../../../domain/task.js";
import type { DashboardPanel, ViewportNav } from "../../types.js";

export type InputSnapshot = {
  active: DashboardPanel;
  detail: TaskRecord | null;
  err: string | null;
  actionErr: string | null;
  searchMode: boolean;
  fp: TaskRecord[];
  fh: TaskRecord[];
  pipeNav: ViewportNav;
  histNav: ViewportNav;
};

export function rowAtCursor(panel: DashboardPanel, s: InputSnapshot): TaskRecord | undefined {
  const list = panel === "pipeline" ? s.fp : s.fh;
  const { cursor } = panel === "pipeline" ? s.pipeNav : s.histNav;
  return list[cursor];
}
