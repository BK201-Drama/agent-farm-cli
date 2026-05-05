import { useMemo } from "react";
import { Box, Text, useStdin } from "ink";
import {
  BorderedSection,
  DashHeader,
  EmptyHint,
  FooterHint,
  HistoryTaskList,
  LoadErrorPanel,
  PipelineTaskList,
  SectionTitleStat,
  TableHeaderRow,
  TaskDetailOverlay,
} from "./components/index.js";
import {
  historyBorderColor,
  isHistoryStatus,
  isPipelineStatus,
  pipelineBorderColor,
  pipelineStatusSummary,
  sortHistory,
  sortPipeline,
  type DashboardTheme,
} from "./helpers.js";
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

  const pipeline = useMemo(() => {
    const p = tasks.filter((t) => isPipelineStatus(String(t.status ?? "queued")));
    p.sort(sortPipeline);
    return p;
  }, [tasks]);

  const history = useMemo(() => {
    const h = tasks.filter((t) => isHistoryStatus(String(t.status ?? "")));
    h.sort(sortHistory);
    return h;
  }, [tasks]);

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

  const W = Math.max(40, cols);
  const ruleLen = Math.min(W - 2, 120);
  const padX = 1;
  const wPulse = 2;
  const wSt = 8;
  const wWhen = 5;
  const wIdPipe = Math.min(20, Math.max(8, Math.floor((W - 16) * 0.25)));
  const wIdHist = wIdPipe;
  const promptPipe = Math.max(10, W - 4 - padX * 2 - wPulse - wSt - wIdPipe);
  const promptHist = Math.max(10, W - 4 - padX * 2 - wWhen - wSt - wIdHist);

  const VP = dashboardViewport.pipe;
  const VH = dashboardViewport.hist;

  const pipeVis = filteredPipeline.slice(pipeNav.scroll, pipeNav.scroll + VP);
  const histVis = filteredHistory.slice(histNav.scroll, histNav.scroll + VH);

  const highlightPipeId =
    active === "pipeline" && filteredPipeline.length > 0
      ? String(filteredPipeline[pipeNav.cursor]?.task_id ?? "")
      : null;
  const highlightHistId =
    active === "history" && filteredHistory.length > 0
      ? String(filteredHistory[histNav.cursor]?.task_id ?? "")
      : "";

  const pipeCols = [
    { key: "pulse", width: wPulse, label: " " },
    { key: "st", width: wSt, label: "status" },
    { key: "id", width: wIdPipe, label: "task_id" },
  ];
  const histCols = [
    { key: "when", width: wWhen, label: "when" },
    { key: "st", width: wSt, label: "status" },
    { key: "id", width: wIdHist, label: "task_id" },
  ];

  const pipeTitleColor = pipelineBorderColor(theme);
  const histTitleColor = historyBorderColor(theme);

  return (
    <Box flexDirection="column" width={W}>
      <DashHeader
        width={W}
        ruleLen={ruleLen}
        keyboardInput={keyboardInput}
        tasksCount={tasks.length}
        pipelineCount={pipeline.length}
        historyCount={history.length}
        lastOk={lastOk}
      />

      {err ? (
        <Box paddingX={1}>
          <LoadErrorPanel width={W - 2} message={err} />
        </Box>
      ) : (
        <Box flexDirection="column" paddingX={1}>
          <BorderedSection
            width={W - 2}
            marginBottom={1}
            borderColor={pipeTitleColor}
            paddingX={padX}
            paddingY={1}
            title={
              <SectionTitleStat
                titleColor={pipeTitleColor}
                title="执行管线"
                dimPrefix="显示 "
                statValue={filteredPipeline.length}
                dimSuffix={
                  filteredPipeline.length !== pipeline.length
                    ? ` / 共 ${pipeline.length} · ${pipelineStatusSummary(filteredPipeline)}`
                    : ` · ${pipelineStatusSummary(filteredPipeline)}`
                }
              />
            }
            ruleLen={ruleLen}
            tableHeader={<TableHeaderRow columns={pipeCols} trailingLabel="prompt" />}
          >
            {filteredPipeline.length === 0 ? (
              <EmptyHint>{searchQuery.trim() ? "无匹配任务" : "暂无管线任务"}</EmptyHint>
            ) : pipeVis.length === 0 ? (
              <EmptyHint>滚动范围异常</EmptyHint>
            ) : (
              <PipelineTaskList
                rows={pipeVis}
                wPulse={wPulse}
                wSt={wSt}
                wIdPipe={wIdPipe}
                promptPipe={promptPipe}
                highlightTaskId={highlightPipeId}
              />
            )}
          </BorderedSection>

          <BorderedSection
            width={W - 2}
            marginBottom={0}
            borderColor={histTitleColor}
            paddingX={padX}
            paddingY={1}
            title={
              <SectionTitleStat
                titleColor={histTitleColor}
                title="归档"
                dimPrefix="显示 "
                statValue={filteredHistory.length}
                dimSuffix={filteredHistory.length !== history.length ? ` / 共 ${history.length}` : ""}
              />
            }
            ruleLen={ruleLen}
            tableHeader={<TableHeaderRow columns={histCols} trailingLabel="prompt" />}
          >
            {filteredHistory.length === 0 ? (
              <EmptyHint>{searchQuery.trim() ? "无匹配任务" : "暂无归档"}</EmptyHint>
            ) : histVis.length === 0 ? (
              <EmptyHint>滚动范围异常</EmptyHint>
            ) : (
              <HistoryTaskList
                rows={histVis}
                wWhen={wWhen}
                wSt={wSt}
                wIdHist={wIdHist}
                promptHist={promptHist}
                highlightTaskId={highlightHistId}
              />
            )}
          </BorderedSection>
        </Box>
      )}

      <FooterHint refreshMs={refreshMs} searchMode={searchMode} searchQuery={searchQuery} />

      {!keyboardInput ? (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor italic>stdin 非 raw：键盘导航不可用，请在本机终端直接运行。</Text>
        </Box>
      ) : null}

      {detailTask ? <TaskDetailOverlay task={detailTask} width={W - 2} /> : null}
    </Box>
  );
}
