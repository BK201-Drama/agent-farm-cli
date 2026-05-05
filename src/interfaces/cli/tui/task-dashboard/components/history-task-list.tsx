import { useEffect, useState } from "react";
import type { TaskRecord } from "../../../../../domain/task.js";
import { Box, Text } from "ink";
import {
  clipPrompt,
  failureHint,
  padCell,
  relativeShort,
  statusCell,
  statusColor,
} from "../helpers.js";

export type HistoryTaskListProps = {
  rows: TaskRecord[];
  wWhen: number;
  wSt: number;
  wErr: number;
  wIdHist: number;
  promptHist: number;
  highlightTaskId: string | null;
};

export function HistoryTaskList({
  rows,
  wWhen,
  wSt,
  wErr,
  wIdHist,
  promptHist,
  highlightTaskId,
}: HistoryTaskListProps) {
  const [, setRelTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRelTick((n) => n + 1), 8000);
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
        const err = failureHint(t, wErr);
        const rowDim = i % 2 === 1;
        const sel = highlightTaskId != null && highlightTaskId !== "" && id === highlightTaskId;
        const errHot = err !== "" && (st === "failed" || st === "blocked" || st === "retry" || st === "rejected");
        return (
          <Box key={`h-${id}-${i}`} flexDirection="row" flexWrap="nowrap" columnGap={1}>
            <Box width={wWhen} minWidth={wWhen} overflow="hidden">
              <Text dimColor bold={sel} wrap="truncate-end">
                {padCell(rel, wWhen)}
              </Text>
            </Box>
            <Box width={wSt} minWidth={wSt} overflow="hidden">
              <Text color={statusColor(st)} dimColor={rowDim && !sel} bold={sel} wrap="truncate-end">
                {statusCell(st, wSt)}
              </Text>
            </Box>
            <Box width={wErr} minWidth={wErr} overflow="hidden">
              <Text color={errHot ? "red" : "gray"} dimColor={!errHot && rowDim && !sel} bold={sel} wrap="truncate-end">
                {padCell(err || "—", wErr)}
              </Text>
            </Box>
            <Box width={wIdHist} minWidth={wIdHist} overflow="hidden">
              <Text color="gray" dimColor={rowDim && !sel} bold={sel} wrap="truncate-end">
                {padCell(clipPrompt(id, wIdHist), wIdHist)}
              </Text>
            </Box>
            <Box flexGrow={1} overflow="hidden">
              <Text dimColor={rowDim && !sel} bold={sel} wrap="truncate-end">
                {pr}
              </Text>
            </Box>
          </Box>
        );
      })}
    </>
  );
}
