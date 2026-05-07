import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, useInput, type Key } from "ink";
import { clampViewport, filterTasksByQuery } from "../../helpers/index.js";
import type { DashboardPanel } from "../../types.js";
import { handleDashboardNavKey } from "./handle-dashboard-input.js";
import type { InputSnapshot } from "./input-snapshot.js";
import type { DashboardNavState, UseDashboardNavOpts } from "./types.js";

/**
 * 看板键盘：Tab 切面板 · ↑↓jk 滚动 · Enter 详情 · / 搜索 · q/ESC 退出（详情内 ESC/q 先关详情）
 */
export function useDashboardNav({
  keyboardInput,
  err,
  pipeline,
  history,
  queueActions,
  viewportPipe,
  viewportHist,
}: UseDashboardNavOpts): DashboardNavState {
  const { exit } = useApp();
  const vpRef = useRef(viewportPipe);
  const vhRef = useRef(viewportHist);
  vpRef.current = viewportPipe;
  vhRef.current = viewportHist;

  const [active, setActive] = useState<DashboardPanel>("pipeline");
  const [pipeNav, setPipeNav] = useState<InputSnapshot["pipeNav"]>({ cursor: 0, scroll: 0 });
  const [histNav, setHistNav] = useState<InputSnapshot["histNav"]>({ cursor: 0, scroll: 0 });
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTask, setDetailTask] = useState<DashboardNavState["detailTask"]>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const filteredPipeline = useMemo(() => filterTasksByQuery(pipeline, searchQuery), [pipeline, searchQuery]);
  const filteredHistory = useMemo(() => filterTasksByQuery(history, searchQuery), [history, searchQuery]);

  const snapRef = useRef<InputSnapshot>({
    active,
    detail: detailTask,
    err,
    actionErr,
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
    actionErr,
    searchMode,
    fp: filteredPipeline,
    fh: filteredHistory,
    pipeNav,
    histNav,
  };

  useEffect(() => {
    const z: InputSnapshot["pipeNav"] = { cursor: 0, scroll: 0 };
    setPipeNav(z);
    setHistNav(z);
  }, [searchQuery]);

  useEffect(() => {
    setPipeNav((n) => clampViewport(n.cursor, n.scroll, filteredPipeline.length, viewportPipe));
    setHistNav((n) => clampViewport(n.cursor, n.scroll, filteredHistory.length, viewportHist));
  }, [filteredPipeline.length, filteredHistory.length, viewportPipe, viewportHist]);

  const onInput = useCallback(
    (input: string, key: Key) => {
      handleDashboardNavKey(
        {
          exit,
          queueActions,
          setDetailTask,
          setActionErr,
          setSearchMode,
          setSearchQuery,
          setActive,
          setPipeNav,
          setHistNav,
          getViewportPipe: () => vpRef.current,
          getViewportHist: () => vhRef.current,
        },
        snapRef.current,
        input,
        key,
      );
    },
    [exit, queueActions],
  );

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
    actionErr,
  };
}
