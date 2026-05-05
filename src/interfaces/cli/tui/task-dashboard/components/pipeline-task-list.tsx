import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { TaskRecord } from "../../../../../domain/task.js";
import { clipPrompt, padCell, statusColor } from "../helpers.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export type PipelineTaskListProps = {
  rows: TaskRecord[];
  wPulse: number;
  wSt: number;
  wIdPipe: number;
  promptPipe: number;
  highlightTaskId?: string | null;
};

function needsPulseRow(t: TaskRecord): boolean {
  const st = String(t.status ?? "");
  return st === "running" || st === "claimed";
}

export function PipelineTaskList({ rows, wPulse, wSt, wIdPipe, promptPipe, highlightTaskId }: PipelineTaskListProps) {
  const [spinIdx, setSpinIdx] = useState(0);
  const animate = rows.some(needsPulseRow);

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setSpinIdx((i) => i + 1), 120);
    return () => clearInterval(id);
  }, [animate]);

  const spin = SPINNER[spinIdx % SPINNER.length] ?? "⠋";

  return (
    <>
      {rows.map((t, i) => {
        const st = String(t.status ?? "");
        const id = String(t.task_id ?? "—");
        const pr = clipPrompt(String(t.prompt ?? ""), promptPipe);
        const pulse = animate && needsPulseRow(t) ? spin : " ";
        const rowDim = i % 2 === 1 && st !== "running";
        const sel = highlightTaskId != null && highlightTaskId !== "" && id === highlightTaskId;
        return (
          <Box key={`p-${id}-${i}`} flexDirection="row">
            <Box width={wPulse}>
              <Text color={statusColor(st)} bold={sel}>
                {pulse}{" "}
              </Text>
            </Box>
            <Box width={wSt}>
              <Text bold={st === "running" || sel} color={statusColor(st)} dimColor={rowDim && !sel}>
                {padCell(st.slice(0, wSt), wSt)}
              </Text>
            </Box>
            <Box width={wIdPipe}>
              <Text color="gray" dimColor={rowDim && !sel} bold={sel}>
                {padCell(clipPrompt(id, wIdPipe), wIdPipe)}
              </Text>
            </Box>
            <Text dimColor={rowDim && !sel} bold={sel}>
              {pr}
            </Text>
          </Box>
        );
      })}
    </>
  );
}
