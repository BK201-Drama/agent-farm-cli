import { Box, Text } from "ink";
import { padCell } from "../helpers.js";

export type TableColumn = { key: string; width: number; label: string };

export type TableHeaderRowProps = {
  columns: TableColumn[];
  trailingLabel?: string;
};

export function TableHeaderRow({ columns, trailingLabel }: TableHeaderRowProps) {
  return (
    <Box flexDirection="row" marginBottom={1}>
      {columns.map((c) => (
        <Box key={c.key} width={c.width}>
          <Text dimColor bold>
            {padCell(c.label, c.width)}
          </Text>
        </Box>
      ))}
      {trailingLabel ? (
        <Text dimColor bold>
          {trailingLabel}
        </Text>
      ) : null}
    </Box>
  );
}
