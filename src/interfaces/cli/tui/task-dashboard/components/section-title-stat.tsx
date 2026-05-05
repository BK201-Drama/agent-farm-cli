import { Box, Text } from "ink";

export type SectionTitleStatProps = {
  titleColor: "cyan" | "blue";
  title: string;
  dimPrefix: string;
  statValue: number;
  dimSuffix: string;
};

export function SectionTitleStat({ titleColor, title, dimPrefix, statValue, dimSuffix }: SectionTitleStatProps) {
  return (
    <Box flexDirection="row" alignItems="center" marginBottom={1}>
      <Text bold color={titleColor}>
        ▸ {title}
      </Text>
      <Text color="gray"> </Text>
      <Text dimColor>{dimPrefix}</Text>
      <Text color="white">{statValue}</Text>
      <Text dimColor>{dimSuffix}</Text>
    </Box>
  );
}
