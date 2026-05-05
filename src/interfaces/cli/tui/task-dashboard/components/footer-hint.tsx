import { Box, Text } from "ink";

export type FooterHintProps = {
  refreshMs: number;
};

export function FooterHint({ refreshMs }: FooterHintProps) {
  return (
    <Box marginTop={1} paddingX={1}>
      <Text dimColor italic>
        每 {refreshMs} ms 同步 · running / claimed 行首动画表示 worker 仍在推进
      </Text>
    </Box>
  );
}
