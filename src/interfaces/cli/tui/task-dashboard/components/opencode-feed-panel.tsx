import type { ReactNode } from "react";
import { Box, Text } from "ink";
import type { OpencodeFeedRow } from "../../../../../infrastructure/opencode/opencode-feed.js";
import { BorderedSection } from "./bordered-section.js";
import { SectionTitleStat } from "./section-title-stat.js";
import type { DashboardLayout } from "../dashboard-layout.js";

export type OpencodeFeedPanelProps = {
  layout: DashboardLayout;
  viewportLines: number;
  rows: OpencodeFeedRow[];
  pollErr: string | null;
  refreshMs: number;
};

function clipToWidth(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function OpencodeFeedPanel({
  layout,
  viewportLines,
  rows,
  pollErr,
  refreshMs,
}: OpencodeFeedPanelProps) {
  const w = Math.max(16, layout.sectionWidth - layout.padX * 2 - 2);
  let firstSlot: ReactNode = null;
  let dataLines = viewportLines;
  if (pollErr) {
    firstSlot = (
      <Text color="red" wrap="truncate">
        {clipToWidth(pollErr, w)}
      </Text>
    );
    dataLines = Math.max(0, viewportLines - 1);
  } else if (rows.length === 0) {
    firstSlot = (
      <Text dimColor wrap="truncate">
        {clipToWidth("暂无本会话目录下的 OpenCode 摘要（session list / export）", w)}
      </Text>
    );
    dataLines = Math.max(0, viewportLines - 1);
  }
  const visible = rows.slice(0, dataLines);
  const pad = Math.max(0, dataLines - visible.length);

  return (
    <BorderedSection
      width={layout.sectionWidth}
      marginBottom={0}
      borderColor="magenta"
      paddingX={layout.padX}
      paddingY={0}
      title={
        <SectionTitleStat
          titleColor="magenta"
          title="OpenCode 推理/工具"
          dimPrefix="轮询 "
          statValue={refreshMs}
          dimSuffix="ms · npx opencode-ai"
          compact
        />
      }
      ruleLen={layout.ruleLen}
      tableHeader={
        <Text dimColor wrap="truncate">
          {clipToWidth("会话 · 类型 · 片段", w)}
        </Text>
      }
    >
      {firstSlot}
      {visible.map((r, i) => (
        <Box key={`${r.sessionId}-${i}-${r.body.slice(0, 8)}`} flexDirection="row">
          <Text wrap="truncate">
            <Text color="gray">{clipToWidth(r.sessionId, 10)}</Text>
            <Text> </Text>
            <Text color="magenta">{clipToWidth(r.kind, 6)}</Text>
            <Text> </Text>
            <Text dimColor={false}>{clipToWidth(r.body, Math.max(8, w - 18))}</Text>
          </Text>
        </Box>
      ))}
      {pad > 0
        ? Array.from({ length: pad }, (_, i) => (
            <Text key={`pad-${i}`} dimColor>
              {" "}
            </Text>
          ))
        : null}
    </BorderedSection>
  );
}
