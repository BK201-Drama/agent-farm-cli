import { BorderedSection } from "./bordered-section.js";
import { FilteredListBody } from "./filtered-list-body.js";
import { HistoryTaskList } from "./history-task-list.js";
import { PipelineTaskList } from "./pipeline-task-list.js";
import { SectionTitleStat } from "./section-title-stat.js";
import { TableHeaderRow } from "./table-header-row.js";
import {
  historyBorderColor,
  pipelineBorderColor,
  pipelineStatusSummary,
  type DashboardTheme,
} from "../helpers.js";
import type { TaskRecord } from "../../../../../domain/task.js";
import type { DashboardLayout } from "../dashboard-layout.js";
import type { ViewportNav } from "../types.js";

export type TaskBoardSectionKind = "pipeline" | "history";

export type TaskBoardSectionProps = {
  kind: TaskBoardSectionKind;
  theme: DashboardTheme;
  layout: DashboardLayout;
  searchQuery: string;
  filtered: TaskRecord[];
  sourceTotal: TaskRecord[];
  nav: ViewportNav;
  viewport: number;
  highlightTaskId: string | null;
  marginBottom: number;
  title: string;
};

export function TaskBoardSection({
  kind,
  theme,
  layout,
  searchQuery,
  filtered,
  sourceTotal,
  nav,
  viewport,
  highlightTaskId,
  marginBottom,
  title,
}: TaskBoardSectionProps) {
  const borderColor = kind === "pipeline" ? pipelineBorderColor(theme) : historyBorderColor(theme);
  const tableColumns = kind === "pipeline" ? layout.pipeline.columns : layout.history.columns;

  const dimSuffix =
    kind === "pipeline"
      ? filtered.length !== sourceTotal.length
        ? ` / 共 ${sourceTotal.length} · ${pipelineStatusSummary(filtered)}`
        : ` · ${pipelineStatusSummary(filtered)}`
      : filtered.length !== sourceTotal.length
        ? ` / 共 ${sourceTotal.length}`
        : "";

  const visible = filtered.slice(nav.scroll, nav.scroll + viewport);

  return (
    <BorderedSection
      width={layout.sectionWidth}
      marginBottom={marginBottom}
      borderColor={borderColor}
      paddingX={layout.padX}
      paddingY={1}
      title={
        <SectionTitleStat
          titleColor={borderColor}
          title={title}
          dimPrefix="显示 "
          statValue={filtered.length}
          dimSuffix={dimSuffix}
        />
      }
      ruleLen={layout.ruleLen}
      tableHeader={<TableHeaderRow columns={tableColumns} trailingLabel="prompt" />}
    >
      <FilteredListBody
        searchQuery={searchQuery}
        filteredLen={filtered.length}
        visibleLen={visible.length}
        emptyDefault={kind === "pipeline" ? "暂无管线任务" : "暂无归档"}
      >
        {kind === "pipeline" ? (
          <PipelineTaskList
            rows={visible}
            wPulse={layout.pipeline.wPulse}
            wSt={layout.wSt}
            wIdPipe={layout.pipeline.wId}
            promptPipe={layout.pipeline.prompt}
            highlightTaskId={highlightTaskId}
          />
        ) : (
          <HistoryTaskList
            rows={visible}
            wWhen={layout.history.wWhen}
            wSt={layout.wSt}
            wIdHist={layout.history.wId}
            promptHist={layout.history.prompt}
            highlightTaskId={highlightTaskId}
          />
        )}
      </FilteredListBody>
    </BorderedSection>
  );
}
