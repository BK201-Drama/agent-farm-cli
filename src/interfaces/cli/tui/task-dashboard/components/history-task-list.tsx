import { useEffect, useState } from "react";
import type { TaskRecord } from "../../../../../domain/task.js";
import { Box, Text } from "ink";
import { clipPrompt, padCell, relativeShort, statusColor } from "../helpers.js";

export type HistoryTaskListProps = {
  rows: TaskRecord[];
  wWhen: number;
  wSt: number;
  wIdHist: number;
  promptHist: number;
  highlightTaskId: string | null;
};

export function HistoryTaskList({ rows, wWhen, wSt, wIdHist, promptHist, highlightTaskId }: HistoryTaskListProps) {
  const [, setRelTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRelTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {rows.map((t, i) => {
        const st = String(t.status ?? "");
        const id = String(t.task_id ?? "—");
        const pr = clipPrompt(String(t.prompt ?? ""), promptHist);
        const iso = String(t.completed_at ?? t.updated_at ?? t.created_at ?? "");
        const rel = relativeShort(iso || undefined);
        const rowDim = i % 2 === 1;
        const sel = highlightTaskId != null && highlightTaskId !== "" && id === highlightTaskId;
        return (
          <Box key={`h-${id}-${i}`} flexDirection="row">
            <Box width={wWhen}>
              <Text dimColor bold={sel}>
                {padCell(rel, wWhen)}
              </Text>
            </Box>
            <Box width={wSt}>
              <Text color={statusColor(st)} dimColor={rowDim && !sel} bold={sel}>
                {padCell(st.slice(0, wSt), wSt)}
              </Text>
            </Box>
            <Box width={wIdHist}>
              <Text color="gray" dimColor={rowDim && !sel} bold={sel}>
                {padCell(clipPrompt(id, wIdHist), wIdHist)}
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
