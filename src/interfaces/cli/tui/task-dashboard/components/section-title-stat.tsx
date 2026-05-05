import { Box, Text } from "ink";

export type SectionTitleStatProps = {
  titleColor: "cyan" | "blue" | "magenta" | "gray";
  title: string;
  dimPrefix: string;
  statValue: number;
  dimSuffix: string;
  /** 看板高密度：收紧标题下间距 */
  compact?: boolean;
};

export function SectionTitleStat({
  titleColor,
  title,
  dimPrefix,
  statValue,
  dimSuffix,
  compact = false,
}: SectionTitleStatProps) {
  return (
    <Box flexDirection="row" alignItems="center" marginBottom={compact ? 0 : 1}>
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
