import { Box, Text } from "ink";

export type FooterHintProps = {
  refreshMs: number;
  searchMode?: boolean;
  searchQuery?: string;
};

export function FooterHint({ refreshMs, searchMode = false, searchQuery = "" }: FooterHintProps) {
  return (
    <Box marginTop={1} paddingX={1} flexDirection="column">
      {searchMode ? (
        <Text color="yellow">
          搜索 <Text bold>/</Text> 输入中… 「{searchQuery}」 Enter 结束 · Esc 清空
        </Text>
      ) : null}
      <Text dimColor italic>
        每 {refreshMs} ms 同步 · Tab 切换面板 · ↑↓jk 移动 · Enter 详情 · / 搜索 · npm run farm:insights / farm:doctor
      </Text>
    </Box>
  );
}
