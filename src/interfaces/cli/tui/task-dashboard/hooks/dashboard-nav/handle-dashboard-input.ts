import type { Key } from "ink";
import type { DashboardQueueCommands } from "../../../../../../application/contracts/dashboard-queue-commands.js";
import { isAllowedTaskTransition, type TaskRecord, type TaskStatus } from "../../../../../../domain/task.js";
import { clampViewport } from "../../helpers/index.js";
import type { DashboardPanel, ViewportNav } from "../../types.js";
import type { InputSnapshot } from "./input-snapshot.js";
import { rowAtCursor } from "./input-snapshot.js";

export type DashboardInputHandlers = {
  exit: () => void;
  queueActions: DashboardQueueCommands | undefined;
  setDetailTask: (t: TaskRecord | null) => void;
  setActionErr: (e: string | null) => void;
  setSearchMode: (v: boolean) => void;
  setSearchQuery: (q: string | ((prev: string) => string)) => void;
  setActive: (fn: (a: DashboardPanel) => DashboardPanel) => void;
  setPipeNav: (fn: (n: ViewportNav) => ViewportNav) => void;
  setHistNav: (fn: (n: ViewportNav) => ViewportNav) => void;
  getViewportPipe: () => number;
  getViewportHist: () => number;
};

/**
 * 看板键盘：Tab 切面板 · ↑↓jk 滚动 · Enter 详情 · / 搜索 · q/ESC 退出（详情内 ESC/q 先关详情）
 */
export function handleDashboardNavKey(h: DashboardInputHandlers, s: InputSnapshot, input: string, key: Key): void {
  if (s.detail) {
    if (key.escape || input === "q") {
      h.setDetailTask(null);
      h.setActionErr(null);
      return;
    }
    const taskStatus = s.detail.status as TaskStatus;
    const qa = h.queueActions;
    if (!qa) return;

    if (input === "a" && taskStatus === "review") {
      h.setActionErr(null);
      qa.reviewApprove(String(s.detail.task_id), "dashboard", "", false)
        .then(() => h.setDetailTask(null))
        .catch((e: Error) => h.setActionErr(e.message));
      return;
    }
    if (input === "r" && taskStatus === "review") {
      h.setActionErr(null);
      qa.reviewReject(String(s.detail.task_id), "dashboard", "", false)
        .then(() => h.setDetailTask(null))
        .catch((e: Error) => h.setActionErr(e.message));
      return;
    }
    if (input === "c" && (taskStatus === "queued" || taskStatus === "retry")) {
      if (!isAllowedTaskTransition(taskStatus, "cancelled")) {
        h.setActionErr(`Cannot cancel task in ${taskStatus} status`);
        return;
      }
      h.setActionErr(null);
      qa.updateStatus(String(s.detail.task_id), "cancelled")
        .then(() => h.setDetailTask(null))
        .catch((e: Error) => h.setActionErr(e.message));
      return;
    }
    if ((input === "a" || input === "r" || input === "c") && !s.actionErr) {
      h.setActionErr(`Key '${input}' not available for status '${taskStatus}'`);
      return;
    }
    return;
  }

  if (s.searchMode) {
    if (key.escape) {
      h.setSearchMode(false);
      h.setSearchQuery("");
      return;
    }
    if (key.return) {
      h.setSearchMode(false);
      return;
    }
    if (key.backspace) {
      h.setSearchQuery((q) => q.slice(0, -1));
      return;
    }
    if (input.length === 1 && !key.ctrl && !key.meta) {
      h.setSearchQuery((q) => q + input);
    }
    return;
  }

  if (input === "/" && !key.ctrl && !key.meta) {
    h.setSearchMode(true);
    return;
  }
  if (key.escape || (input === "q" && !key.ctrl)) {
    h.exit();
    return;
  }
  if (key.tab) {
    h.setActive((a) => (a === "pipeline" ? "history" : "pipeline"));
    return;
  }
  if (s.err) return;

  const panel = s.active;
  const len = panel === "pipeline" ? s.fp.length : s.fh.length;
  const view = panel === "pipeline" ? h.getViewportPipe() : h.getViewportHist();
  const move = (delta: number) => {
    if (panel === "pipeline") {
      h.setPipeNav((nav) => clampViewport(nav.cursor + delta, nav.scroll, len, view));
    } else {
      h.setHistNav((nav) => clampViewport(nav.cursor + delta, nav.scroll, len, view));
    }
  };

  if (key.upArrow || input === "k") {
    move(-1);
    return;
  }
  if (key.downArrow || input === "j") {
    move(1);
    return;
  }
  if (key.return) {
    const t = rowAtCursor(panel, s);
    if (t) h.setDetailTask(t);
  }
}
