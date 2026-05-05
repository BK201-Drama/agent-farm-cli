import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, useInput, type Key } from "ink";
import type { TaskRecord } from "../../../../../domain/task.js";
import { clampViewport, filterTasksByQuery } from "../helpers.js";
import type { DashboardPanel, ViewportNav } from "../types.js";

const V_PIPE = 14;
const V_HIST = 20;

export type DashboardNavState = {
  active: DashboardPanel;
  pipeNav: ViewportNav;
  histNav: ViewportNav;
  searchMode: boolean;
  searchQuery: string;
  detailTask: TaskRecord | null;
  filteredPipeline: TaskRecord[];
  filteredHistory: TaskRecord[];
};

export type UseDashboardNavOpts = {
  keyboardInput: boolean;
  err: string | null;
  pipeline: TaskRecord[];
  history: TaskRecord[];
};

type InputSnapshot = {
  active: DashboardPanel;
  detail: TaskRecord | null;
  err: string | null;
  searchMode: boolean;
  fp: TaskRecord[];
  fh: TaskRecord[];
  pipeNav: ViewportNav;
  histNav: ViewportNav;
};

function rowAtCursor(panel: DashboardPanel, s: InputSnapshot): TaskRecord | undefined {
  const list = panel === "pipeline" ? s.fp : s.fh;
  const { cursor } = panel === "pipeline" ? s.pipeNav : s.histNav;
  return list[cursor];
}

/**
 * 看板键盘：Tab 切面板 · ↑↓jk 滚动 · Enter 详情 · / 搜索 · q/ESC 退出（详情内 ESC/q 先关详情）
 */
export function useDashboardNav({
  keyboardInput,
  err,
  pipeline,
  history,
}: UseDashboardNavOpts): DashboardNavState {
  const { exit } = useApp();
  const [active, setActive] = useState<DashboardPanel>("pipeline");
  const [pipeNav, setPipeNav] = useState<ViewportNav>({ cursor: 0, scroll: 0 });
  const [histNav, setHistNav] = useState<ViewportNav>({ cursor: 0, scroll: 0 });
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTask, setDetailTask] = useState<TaskRecord | null>(null);

  const filteredPipeline = useMemo(() => filterTasksByQuery(pipeline, searchQuery), [pipeline, searchQuery]);
  const filteredHistory = useMemo(() => filterTasksByQuery(history, searchQuery), [history, searchQuery]);

  const snapRef = useRef<InputSnapshot>({
    active,
    detail: detailTask,
    err,
    searchMode,
    fp: filteredPipeline,
    fh: filteredHistory,
    pipeNav,
    histNav,
  });
  snapRef.current = {
    active,
    detail: detailTask,
    err,
    searchMode,
    fp: filteredPipeline,
    fh: filteredHistory,
    pipeNav,
    histNav,
  };

  useEffect(() => {
    const z: ViewportNav = { cursor: 0, scroll: 0 };
    setPipeNav(z);
    setHistNav(z);
  }, [searchQuery]);

  useEffect(() => {
    setPipeNav((n) => clampViewport(n.cursor, n.scroll, filteredPipeline.length, V_PIPE));
    setHistNav((n) => clampViewport(n.cursor, n.scroll, filteredHistory.length, V_HIST));
  }, [filteredPipeline.length, filteredHistory.length]);

  const onInput = useCallback((input: string, key: Key) => {
    const s = snapRef.current;

    if (s.detail) {
      if (key.escape || input === "q") setDetailTask(null);
      return;
    }

    if (s.searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchQuery("");
        return;
      }
      if (key.return) {
        setSearchMode(false);
        return;
      }
      if (key.backspace) {
        setSearchQuery((q) => q.slice(0, -1));
        return;
      }
      if (input.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + input);
      }
      return;
    }

    if (input === "/" && !key.ctrl && !key.meta) {
      setSearchMode(true);
      return;
    }
    if (key.escape || (input === "q" && !key.ctrl)) {
      exit();
      return;
    }
    if (key.tab) {
      setActive((a) => (a === "pipeline" ? "history" : "pipeline"));
      return;
    }
    if (s.err) return;

    const panel = s.active;
    const len = panel === "pipeline" ? s.fp.length : s.fh.length;
    const view = panel === "pipeline" ? V_PIPE : V_HIST;
    const move = (delta: number) => {
      if (panel === "pipeline") {
        setPipeNav((nav) => clampViewport(nav.cursor + delta, nav.scroll, len, view));
      } else {
        setHistNav((nav) => clampViewport(nav.cursor + delta, nav.scroll, len, view));
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
      if (t) setDetailTask(t);
    }
  }, [exit]);

  useInput(onInput, { isActive: keyboardInput });

  return {
    active,
    pipeNav,
    histNav,
    searchMode,
    searchQuery,
    detailTask,
    filteredPipeline,
    filteredHistory,
  };
}

export const dashboardViewport = { pipe: V_PIPE, hist: V_HIST } as const;
