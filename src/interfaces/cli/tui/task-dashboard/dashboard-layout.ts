import type { TaskRecord } from "../../../../domain/task.js";
import type { TableColumn } from "./components/table-header-row.js";
import type { DashboardPanel } from "./types.js";

export type DashboardLayout = {
  outerWidth: number;
  sectionWidth: number;
  ruleLen: number;
  padX: number;
  /** 状态列共用宽度 */
  wSt: number;
  pipeline: {
    wPulse: number;
    wSt: number;
    wHb: number;
    wTm: number;
    wId: number;
    prompt: number;
    columns: TableColumn[];
  };
  history: {
    wWhen: number;
    wSt: number;
    wErr: number;
    wId: number;
    prompt: number;
    columns: TableColumn[];
  };
};

/** 根据终端列宽计算看板各列宽度（高密度：hb / topic·mode / err） */
export function computeDashboardLayout(cols: number): DashboardLayout {
  const outerWidth = Math.max(52, cols);
  const sectionWidth = outerWidth - 2;
  const ruleLen = Math.min(outerWidth - 2, 120);
  const padX = 1;
  const innerPad = 4 + padX * 2;

  const wPulse = 2;
  const wSt = 6;
  const wHb = 5;
  const wTm = 11;
  const wWhen = 5;

  let wIdPipe = Math.min(16, Math.max(7, Math.floor((outerWidth - 44) * 0.22)));
  let pipeFixed = wPulse + wSt + wHb + wTm + wIdPipe;
  let promptPipe = outerWidth - innerPad - pipeFixed;
  if (promptPipe < 8) {
    wIdPipe = Math.max(6, wIdPipe - (8 - promptPipe));
    pipeFixed = wPulse + wSt + wHb + wTm + wIdPipe;
    promptPipe = Math.max(8, outerWidth - innerPad - pipeFixed);
  }

  let wIdHist = Math.min(14, Math.max(7, Math.floor((outerWidth - 48) * 0.2)));
  let wErr = Math.min(22, Math.max(10, Math.floor(outerWidth * 0.18)));
  let histFixed = wWhen + wSt + wErr + wIdHist;
  let promptHist = outerWidth - innerPad - histFixed;
  if (promptHist < 8) {
    const deficit = 8 - promptHist;
    wErr = Math.max(8, wErr - deficit);
    histFixed = wWhen + wSt + wErr + wIdHist;
    promptHist = outerWidth - innerPad - histFixed;
    if (promptHist < 8) {
      wIdHist = Math.max(6, wIdHist - (8 - promptHist));
      histFixed = wWhen + wSt + wErr + wIdHist;
      promptHist = Math.max(8, outerWidth - innerPad - histFixed);
    }
  }

  return {
    outerWidth,
    sectionWidth,
    ruleLen,
    padX,
    wSt,
    pipeline: {
      wPulse,
      wSt,
      wHb,
      wTm,
      wId: wIdPipe,
      prompt: promptPipe,
      columns: [
        { key: "pulse", width: wPulse, label: " " },
        { key: "st", width: wSt, label: "status" },
        { key: "hb", width: wHb, label: "since" },
        { key: "tm", width: wTm, label: "topic/mode" },
        { key: "id", width: wIdPipe, label: "task_id" },
      ],
    },
    history: {
      wWhen,
      wSt,
      wErr,
      wId: wIdHist,
      prompt: promptHist,
      columns: [
        { key: "when", width: wWhen, label: "when" },
        { key: "st", width: wSt, label: "status" },
        { key: "err", width: wErr, label: "last_error" },
        { key: "id", width: wIdHist, label: "task_id" },
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
