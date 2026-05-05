import { useMemo } from "react";
import { Box, Text, useStdin } from "ink";
import {
  DashHeader,
  FooterHint,
  LoadErrorPanel,
  TaskBoardSection,
  TaskDetailOverlay,
} from "./components/index.js";
import { computeDashboardLayout, highlightTaskIdForPanel } from "./dashboard-layout.js";
import { partitionSortedTasks, type DashboardTheme } from "./helpers.js";
import { dashboardViewport, useDashboardNav, useTaskPoll } from "./hooks/index.js";

export type TaskDashboardProps = {
  listTasks: () => Promise<import("../../../../domain/task.js").TaskRecord[]>;
  refreshMs: number;
  theme?: DashboardTheme;
};

export function TaskDashboard({ listTasks, refreshMs, theme = "dark" }: TaskDashboardProps) {
  const { isRawModeSupported } = useStdin();
  const keyboardInput = isRawModeSupported === true;
  const { tasks, err, lastOk, cols } = useTaskPoll(listTasks, refreshMs);

  const { pipeline, history } = useMemo(() => partitionSortedTasks(tasks), [tasks]);
  const layout = useMemo(() => computeDashboardLayout(cols), [cols]);

  const {
    active,
    pipeNav,
    histNav,
    searchMode,
    searchQuery,
    detailTask,
    filteredPipeline,
    filteredHistory,
  } = useDashboardNav({
    keyboardInput,
    err,
    pipeline,
    history,
  });

  const VP = dashboardViewport.pipe;
  const VH = dashboardViewport.hist;

  const highlightPipe = highlightTaskIdForPanel(active, "pipeline", filteredPipeline, pipeNav.cursor);
  const highlightHist = highlightTaskIdForPanel(active, "history", filteredHistory, histNav.cursor);

  const { outerWidth: W, sectionWidth } = layout;

  return (
    <Box flexDirection="column" width={W}>
      <DashHeader
        width={W}
        ruleLen={layout.ruleLen}
        keyboardInput={keyboardInput}
        tasksCount={tasks.length}
        pipelineCount={pipeline.length}
        historyCount={history.length}
        lastOk={lastOk}
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
            marginBottom={0}
            title="归档"
          />
        </Box>
      )}

      <FooterHint refreshMs={refreshMs} searchMode={searchMode} searchQuery={searchQuery} />

      {!keyboardInput ? (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor italic>stdin 非 raw：键盘导航不可用，请在本机终端直接运行。</Text>
        </Box>
      ) : null}

      {detailTask ? <TaskDetailOverlay task={detailTask} width={sectionWidth} /> : null}
    </Box>
  );
}
