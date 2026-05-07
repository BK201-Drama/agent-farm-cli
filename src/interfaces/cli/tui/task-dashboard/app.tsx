import { useMemo } from "react";
import { Box, Text, useStdin } from "ink";
import {
  DashHeader,
  FooterHint,
  LoadErrorPanel,
  OpencodeFeedPanel,
  TaskBoardSection,
  TaskDetailOverlay,
} from "./components/index.js";
import { computeDashboardLayout, highlightTaskIdForPanel } from "./dashboard-layout.js";
import { computeDashboardViewports } from "./viewport-plan.js";
import {
  compactStatusBar,
  countUnpartitionedTasks,
  partitionSortedTasks,
  type DashboardTheme,
} from "./helpers/index.js";
import { useDashboardNav, useOpencodeFeed, useTaskPoll } from "./hooks/index.js";
import type { DashboardQueueCommands } from "../../../../application/contracts/dashboard-queue-commands.js";

/** OpenCode 摘要区可视行数（与 viewport-plan 中 opencodeFeedLines 一致） */
const OPENCODE_FEED_VIEWPORT_LINES = 5;

export type TaskDashboardProps = {
  listTasks: () => Promise<import("../../../../domain/task.js").TaskRecord[]>;
  refreshMs: number;
  theme?: DashboardTheme;
  storageLines?: string[];
  queueActions?: DashboardQueueCommands;
  /** 队列/工作区根路径，用于过滤 opencode session.directory */
  workspaceRoot?: string;
  /** 是否显示 OpenCode 推理/工具摘要（独立轮询，略慢于队列） */
  opencodeFeed?: boolean;
  opencodeRefreshMs?: number;
  opencodeMaxSessions?: number;
  opencodeRowsPerSession?: number;
};

export function TaskDashboard({
  listTasks,
  refreshMs,
  theme = "dark",
  storageLines = [],
  queueActions,
  workspaceRoot = process.cwd(),
  opencodeFeed = false,
  opencodeRefreshMs = 2500,
  opencodeMaxSessions = 3,
  opencodeRowsPerSession = 4,
}: TaskDashboardProps) {
  const { isRawModeSupported } = useStdin();
  const keyboardInput = isRawModeSupported === true;
  const { tasks, err, lastOk, cols, rows } = useTaskPoll(listTasks, refreshMs);
  const { rows: opencodeRows, err: opencodeErr } = useOpencodeFeed({
    enabled: opencodeFeed && !err,
    workspaceRoot,
    refreshMs: Math.max(800, opencodeRefreshMs),
    maxSessions: Math.min(20, Math.max(1, opencodeMaxSessions)),
    rowsPerSession: Math.min(20, Math.max(1, opencodeRowsPerSession)),
  });
  /** 与 stdout.rows 对齐，使 Ink 判定 outputHeight >= rows，走清屏重绘而非 log-update（矮终端上避免错位「反复打印」） */
  const termRows = Math.max(8, rows);

  const { pipeline, history } = useMemo(() => partitionSortedTasks(tasks), [tasks]);
  const layout = useMemo(() => computeDashboardLayout(cols), [cols]);
  const statusCompact = useMemo(() => compactStatusBar(tasks), [tasks]);
  const otherStatusCount = useMemo(
    () => countUnpartitionedTasks(tasks, pipeline, history),
    [tasks, pipeline, history],
  );

  const viewports = useMemo(
    () =>
      computeDashboardViewports({
        terminalRows: rows,
        storageLineCount: storageLines.length,
        hasStatusCompact: statusCompact.length > 0,
        hasLastOk: lastOk != null,
        showStdinHint: !keyboardInput,
        hasLoadError: Boolean(err),
        opencodeFeedLines: opencodeFeed && !err ? OPENCODE_FEED_VIEWPORT_LINES : 0,
      }),
    [rows, storageLines.length, statusCompact, lastOk, keyboardInput, err, opencodeFeed],
  );

  const {
    active,
    pipeNav,
    histNav,
    searchMode,
    searchQuery,
    detailTask,
    filteredPipeline,
    filteredHistory,
    actionErr,
  } = useDashboardNav({
    keyboardInput,
    err,
    pipeline,
    history,
    queueActions,
    viewportPipe: viewports.pipe,
    viewportHist: viewports.hist,
  });

  const VP = viewports.pipe;
  const VH = viewports.hist;

  const highlightPipe = highlightTaskIdForPanel(active, "pipeline", filteredPipeline, pipeNav.cursor);
  const highlightHist = highlightTaskIdForPanel(active, "history", filteredHistory, histNav.cursor);

  const { outerWidth: W, sectionWidth } = layout;

  return (
    <Box flexDirection="column" width={W} height={termRows} overflow="hidden">
      <DashHeader
        width={W}
        ruleLen={layout.ruleLen}
        keyboardInput={keyboardInput}
        tasksCount={tasks.length}
        pipelineCount={pipeline.length}
        historyCount={history.length}
        lastOk={lastOk}
        statusCompact={statusCompact}
        otherStatusCount={otherStatusCount}
        storageLines={storageLines}
      />

      {err ? (
        <Box paddingX={1}>
          <LoadErrorPanel width={sectionWidth} message={err} />
        </Box>
      ) : (
        <Box flexDirection="column" paddingX={1}>
          <TaskBoardSection
            kind="pipeline"
            theme={theme}
            layout={layout}
            searchQuery={searchQuery}
            filtered={filteredPipeline}
            sourceTotal={pipeline}
            nav={pipeNav}
            viewport={VP}
            highlightTaskId={highlightPipe}
            marginBottom={1}
            title="执行管线"
          />
          <TaskBoardSection
            kind="history"
            theme={theme}
            layout={layout}
            searchQuery={searchQuery}
            filtered={filteredHistory}
            sourceTotal={history}
            nav={histNav}
            viewport={VH}
            highlightTaskId={highlightHist}
            marginBottom={opencodeFeed && !err ? 1 : 0}
            title="归档"
          />
          {opencodeFeed ? (
            <OpencodeFeedPanel
              layout={layout}
              viewportLines={OPENCODE_FEED_VIEWPORT_LINES}
              rows={opencodeRows}
              pollErr={opencodeErr}
              refreshMs={Math.max(800, opencodeRefreshMs)}
            />
          ) : null}
        </Box>
      )}

      <FooterHint
        refreshMs={refreshMs}
        searchMode={searchMode}
        searchQuery={searchQuery}
        opencodeFeedMs={opencodeFeed ? Math.max(800, opencodeRefreshMs) : undefined}
      />

      {!keyboardInput ? (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor italic>stdin 非 raw：键盘导航不可用，请在本机终端直接运行。</Text>
        </Box>
      ) : null}

      {detailTask ? <TaskDetailOverlay task={detailTask} width={sectionWidth} /> : null}

      {actionErr ? (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">操作失败：{actionErr}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
