import { Box, Text } from "ink";
import { padCell } from "../helpers.js";

export type TableColumn = { key: string; width: number; label: string };

export type TableHeaderRowProps = {
  columns: TableColumn[];
  trailingLabel?: string;
  /** 减小表头与首行间距 */
  compact?: boolean;
};

export function TableHeaderRow({ columns, trailingLabel, compact = false }: TableHeaderRowProps) {
  return (
    <Box flexDirection="row" flexWrap="nowrap" columnGap={1} marginBottom={compact ? 0 : 1}>
      {columns.map((c) => (
        <Box key={c.key} width={c.width} minWidth={c.width} overflow="hidden">
          <Text dimColor bold wrap="truncate-end">
            {padCell(c.label, c.width)}
          </Text>
        </Box>
      ))}
      {trailingLabel ? (
        <Box flexGrow={1} overflow="hidden">
          <Text dimColor bold wrap="truncate-end">
            {trailingLabel}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
