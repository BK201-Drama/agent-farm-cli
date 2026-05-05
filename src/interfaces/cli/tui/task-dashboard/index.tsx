import { useEffect, useState } from "react";
import { Box, Text, useApp, useInput, useStdin, render } from "ink";
import type { TaskRecord } from "../../../../domain/task.js";
import {
  BorderedSection,
  DashHeader,
  EmptyHint,
  FooterHint,
  LoadErrorPanel,
  PipelineTaskList,
  SectionTitleStat,
  TableHeaderRow,
} from "./components/index.js";
import {
  clipPrompt,
  isHistoryStatus,
  isPipelineStatus,
  sortHistory,
  sortPipeline,
  statusColor,
  padCell,
} from "./helpers.js";

export type TaskDashboardProps = {
  listTasks: () => Promise<TaskRecord[]>;
  refreshMs: number;
};

export function TaskDashboard({ listTasks, refreshMs }: TaskDashboardProps) {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const keyboardInput = isRawModeSupported === true;
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useInput(
    (input, key) => {
      if (input === "q" || key.escape) exit();
    },
    { isActive: keyboardInput },
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listTasks();
        if (!cancelled) {
          setErr(null);
          setTasks(rows);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [listTasks, refreshMs]);

  const pipeline = tasks.filter((t) => isPipelineStatus(String(t.status ?? "queued")));
  const history = tasks.filter((t) => isHistoryStatus(String(t.status ?? "")));
  pipeline.sort(sortPipeline);
  history.sort(sortHistory);

  const cols = Math.max(60, process.stdout.columns ?? 88);
  const panelW = cols - 2;
  const innerPad = 2;
  const contentW = Math.max(48, panelW - innerPad * 2 - 2);
  const wPulse = 2;
  const wSt = 10;
  const wIdPipe = Math.min(30, Math.max(18, Math.floor(contentW * 0.26)));
  const wWhen = 9;
  const wIdHist = Math.min(28, Math.max(16, Math.floor(contentW * 0.24)));
  const promptPipe = Math.max(14, contentW - wPulse - wSt - wIdPipe - 2);
  const promptHist = Math.max(14, contentW - wWhen - wSt - wIdHist - 3);

  const pipeRows = pipeline.slice(0, 14);
  const histRows = history.slice(0, 20);
  const ruleLen = Math.min(contentW, (process.stdout.columns ?? cols) - 6);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <DashHeader
        width={panelW}
        ruleLen={ruleLen}
        keyboardInput={keyboardInput}
        tasksCount={tasks.length}
        pipelineCount={pipeline.length}
        historyCount={history.length}
      />

      {err ? (
        <LoadErrorPanel width={panelW} message={err} />
      ) : (
        <>
          <BorderedSection
            width={panelW}
            marginBottom={1}
            borderColor="cyan"
            paddingX={innerPad}
            paddingY={1}
            ruleLen={ruleLen}
            title={
              <SectionTitleStat
                titleColor="cyan"
                title="执行管线"
                dimPrefix="活跃任务 · "
                statValue={pipeline.length}
                dimSuffix=" 条"
              />
            }
            tableHeader={
              <TableHeaderRow
                columns={[
                  { key: "pulse", width: wPulse, label: " " },
                  { key: "st", width: wSt, label: "STATE" },
                  { key: "id", width: wIdPipe, label: "JOB ID" },
                ]}
                trailingLabel="SUMMARY"
              />
            }
          >
            {pipeRows.length === 0 ? (
              <EmptyHint>暂无进行中任务 — 另开终端执行 queue add 或启动 worker 后此处会刷新</EmptyHint>
            ) : (
              <PipelineTaskList rows={pipeRows} wPulse={wPulse} wSt={wSt} wIdPipe={wIdPipe} promptPipe={promptPipe} />
            )}
          </BorderedSection>

          <BorderedSection
            width={panelW}
            borderColor="blue"
            paddingX={innerPad}
            paddingY={1}
            ruleLen={ruleLen}
            title={
              <SectionTitleStat
                titleColor="blue"
                title="历史归档"
                dimPrefix="终态 · 最近 "
                statValue={histRows.length}
                dimSuffix=" 条"
              />
            }
            tableHeader={
              <TableHeaderRow
                columns={[
                  { key: "when", width: wWhen, label: "TIME" },
                  { key: "st", width: wSt, label: "STATE" },
                  { key: "id", width: wIdHist, label: "JOB ID" },
                ]}
                trailingLabel="SUMMARY"
              />
            }
          >
            {histRows.length === 0 ? (
              <EmptyHint>尚无 done / failed / cancelled 等终态记录</EmptyHint>
            ) : (
              histRows.map((t, i) => {
                const st = String(t.status ?? "");
                const id = String(t.task_id ?? "—");
                const pr = clipPrompt(String(t.prompt ?? ""), promptHist);
                const when = String(t.completed_at ?? t.updated_at ?? t.created_at ?? "").slice(11, 19);
                const rowDim = i % 2 === 1;
                return (
                  <Box key={`h-${id}-${i}`} flexDirection="row">
                    <Box width={wWhen}>
                      <Text dimColor>{padCell(when || "—", wWhen)}</Text>
                    </Box>
                    <Box width={wSt}>
                      <Text color={statusColor(st)} dimColor={rowDim}>
                        {padCell(st.slice(0, wSt), wSt)}
                      </Text>
                    </Box>
                    <Box width={wIdHist}>
                      <Text color="gray" dimColor={rowDim}>
                        {padCell(clipPrompt(id, wIdHist), wIdHist)}
                      </Text>
                    </Box>
                    <Text dimColor={rowDim}>{pr}</Text>
                  </Box>
                );
              })
            )}
          </BorderedSection>

          <FooterHint refreshMs={refreshMs} />
        </>
      )}
    </Box>
  );
}

export async function runTaskDashboard(opts: {
  listTasks: () => Promise<TaskRecord[]>;
  refreshMs: number;
}): Promise<void> {
  const inst = render(<TaskDashboard listTasks={opts.listTasks} refreshMs={opts.refreshMs} />, {
    exitOnCtrlC: true,
  });
  await inst.waitUntilExit();
}
