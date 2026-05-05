import type { ReactNode } from "react";
import { Box, Text } from "ink";

export type EmptyHintProps = {
  children: ReactNode;
};

export function EmptyHint({ children }: EmptyHintProps) {
  return (
    <Box paddingY={1}>
      <Text dimColor italic>{children}</Text>
    </Box>
  );
}
