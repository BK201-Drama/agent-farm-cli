import type { TaskRecord } from "../../../../domain/task.js";
import type { TableColumn } from "./components/table-header-row.js";
import type { DashboardPanel } from "./types.js";

export type DashboardLayout = {
  outerWidth: number;
  sectionWidth: number;
  ruleLen: number;
  padX: number;
  wSt: number;
  pipeline: {
    wPulse: number;
    wId: number;
    prompt: number;
    columns: TableColumn[];
  };
  history: {
    wWhen: number;
    wId: number;
    prompt: number;
    columns: TableColumn[];
  };
};

/** 根据终端列宽计算看板各列宽度（与 Ink 边框/内边距约定一致） */
export function computeDashboardLayout(cols: number): DashboardLayout {
  const outerWidth = Math.max(40, cols);
  const sectionWidth = outerWidth - 2;
  const ruleLen = Math.min(outerWidth - 2, 120);
  const padX = 1;
  const wPulse = 2;
  const wSt = 8;
  const wWhen = 5;
  const wId = Math.min(20, Math.max(8, Math.floor((outerWidth - 16) * 0.25)));
  const innerPad = 4 + padX * 2;
  const promptPipe = Math.max(10, outerWidth - innerPad - wPulse - wSt - wId);
  const promptHist = Math.max(10, outerWidth - innerPad - wWhen - wSt - wId);

  return {
    outerWidth,
    sectionWidth,
    ruleLen,
    padX,
    wSt,
    pipeline: {
      wPulse,
      wId,
      prompt: promptPipe,
      columns: [
        { key: "pulse", width: wPulse, label: " " },
        { key: "st", width: wSt, label: "status" },
        { key: "id", width: wId, label: "task_id" },
      ],
    },
    history: {
      wWhen,
      wId,
      prompt: promptHist,
      columns: [
        { key: "when", width: wWhen, label: "when" },
        { key: "st", width: wSt, label: "status" },
        { key: "id", width: wId, label: "task_id" },
      ],
    },
  };
}

/** 当前面板与光标对应的 task_id，用于行高亮 */
export function highlightTaskIdForPanel(
  active: DashboardPanel,
  panel: DashboardPanel,
  filtered: TaskRecord[],
  cursor: number,
): string | null {
  if (active !== panel || filtered.length === 0) return null;
  const raw = filtered[cursor]?.task_id;
  const id = raw != null ? String(raw) : "";
  return id === "" ? null : id;
}
