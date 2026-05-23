import { Box, Text } from "ink";

export type FooterHintProps = {
  refreshMs: number;
  searchMode?: boolean;
  searchQuery?: string;
  /** 启用 OpenCode 面板时展示其轮询间隔 */
  opencodeFeedMs?: number;
};

export function FooterHint({ refreshMs, searchMode = false, searchQuery = "", opencodeFeedMs }: FooterHintProps) {
  return (
    <Box marginTop={0} paddingX={1} flexDirection="column">
      {searchMode ? (
        <Text color="yellow" wrap="wrap">
          /「{searchQuery}」Enter结束 Esc清空 — id·prompt·topic·dedupe·status
        </Text>
      ) : null}
      <Text dimColor italic wrap="wrap">
        {refreshMs}ms Tab↑↓jk Enter /insights /doctor
        {opencodeFeedMs != null ? ` · OpenCode ${opencodeFeedMs}ms` : ""}
      </Text>
    </Box>
  );
}
