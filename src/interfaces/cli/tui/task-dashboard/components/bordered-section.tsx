import type { ReactNode } from "react";
import { Box } from "ink";
import { HorizontalRule } from "./horizontal-rule.js";

export type BorderedSectionProps = {
  width: number;
  marginBottom?: number;
  borderColor: "cyan" | "blue" | "magenta" | "gray";
  borderDimColor?: boolean;
  paddingX: number;
  paddingY: number;
  title: ReactNode;
  ruleLen: number;
  tableHeader: ReactNode;
  children: ReactNode;
};

export function BorderedSection({
  width,
  marginBottom = 0,
  borderColor,
  borderDimColor = true,
  paddingX,
  paddingY,
  title,
  ruleLen,
  tableHeader,
  children,
}: BorderedSectionProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      borderDimColor={borderDimColor}
      paddingX={paddingX}
      paddingY={paddingY}
      marginBottom={marginBottom}
      width={width}
    >
      {title}
      <HorizontalRule ruleLen={ruleLen} />
      {tableHeader}
      {children}
    </Box>
  );
}
