import { Box, Text } from "ink";

export type FooterHintProps = {
  refreshMs: number;
  searchMode?: boolean;
  searchQuery?: string;
};

export function FooterHint({ refreshMs, searchMode = false, searchQuery = "" }: FooterHintProps) {
  return (
    <Box marginTop={0} paddingX={1} flexDirection="column">
      {searchMode ? (
        <Text color="yellow" wrap="wrap">
          /「{searchQuery}」Enter结束 Esc清空 — id·prompt·topic·dedupe·status
        </Text>
      ) : null}
      <Text dimColor italic wrap="wrap">
        {refreshMs}ms Tab↑↓jk Enter /insights /doctor
      </Text>
    </Box>
  );
}
