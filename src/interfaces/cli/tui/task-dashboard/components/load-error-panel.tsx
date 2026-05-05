import { Box, Text } from "ink";

export type LoadErrorPanelProps = {
  width: number;
  message: string;
};

export function LoadErrorPanel({ width, message }: LoadErrorPanelProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1} width={width}>
      <Text bold color="red">
        加载失败
      </Text>
      <Text dimColor wrap="wrap">
        {message}
      </Text>
    </Box>
  );
}
