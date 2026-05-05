import { Box, Text } from "ink";
import { dimRule } from "../helpers.js";

export type HorizontalRuleProps = {
  ruleLen: number;
};

export function HorizontalRule({ ruleLen }: HorizontalRuleProps) {
  return (
    <Box marginBottom={1}>
      <Text dimColor>{dimRule(ruleLen)}</Text>
    </Box>
  );
}
