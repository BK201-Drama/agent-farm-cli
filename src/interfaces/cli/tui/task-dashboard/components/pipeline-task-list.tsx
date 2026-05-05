import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { TaskRecord } from "../../../../../domain/task.js";
import {
  clipPrompt,
  livenessIso,
  padCell,
  relativeShort,
  statusCell,
  statusColor,
  topicModeBrief,
} from "../helpers.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export type PipelineTaskListProps = {
  rows: TaskRecord[];
  wPulse: number;
  wSt: number;
  wHb: number;
  wTm: number;
  wIdPipe: number;
  promptPipe: number;
  highlightTaskId?: string | null;
};

function needsPulseRow(t: TaskRecord): boolean {
  const st = String(t.status ?? "");
  return st === "running" || st === "claimed";
}

export function PipelineTaskList({
  rows,
  wPulse,
  wSt,
  wHb,
  wTm,
  wIdPipe,
  promptPipe,
  highlightTaskId,
}: PipelineTaskListProps) {
  const [spinIdx, setSpinIdx] = useState(0);
  const [, setHbTick] = useState(0);
  const animate = rows.some(needsPulseRow);

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setSpinIdx((i) => i + 1), 120);
    return () => clearInterval(id);
  }, [animate]);

  useEffect(() => {
    if (!rows.some(needsPulseRow)) return;
    const id = setInterval(() => setHbTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [rows]);

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
        const iso = livenessIso(t);
        const hbText = needsPulseRow(t) ? relativeShort(iso) : "—";
        const tm = topicModeBrief(t, wTm);
        return (
          <Box key={`p-${id}-${i}`} flexDirection="row" flexWrap="nowrap" columnGap={1}>
            <Box width={wPulse} minWidth={wPulse} overflow="hidden">
              <Text color={statusColor(st)} bold={sel} wrap="truncate-end">
                {pulse}{" "}
              </Text>
            </Box>
            <Box width={wSt} minWidth={wSt} overflow="hidden">
              <Text bold={st === "running" || sel} color={statusColor(st)} dimColor={rowDim && !sel} wrap="truncate-end">
                {statusCell(st, wSt)}
              </Text>
            </Box>
            <Box width={wHb} minWidth={wHb} overflow="hidden">
              <Text
                dimColor={!needsPulseRow(t)}
                color={needsPulseRow(t) ? "yellow" : "gray"}
                bold={sel}
                wrap="truncate-end"
              >
                {statusCell(hbText, wHb)}
              </Text>
            </Box>
            <Box width={wTm} minWidth={wTm} overflow="hidden">
              <Text dimColor={rowDim && !sel} bold={sel} wrap="truncate-end">
                {padCell(tm, wTm)}
              </Text>
            </Box>
            <Box width={wIdPipe} minWidth={wIdPipe} overflow="hidden">
              <Text color="gray" dimColor={rowDim && !sel} bold={sel} wrap="truncate-end">
                {padCell(clipPrompt(id, wIdPipe), wIdPipe)}
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
