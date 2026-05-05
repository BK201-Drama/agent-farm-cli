import { useEffect, useState } from "react";
import { Box, Spacer, Text } from "ink";
import { dimRule } from "../helpers.js";

const LIVE = ["●", "○"] as const;

/** 动画在子树内，避免根组件高频 setState 导致 Ink log-update 错位、顶行反复刷 */
function LivePulse() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const live = LIVE[i % 2] ?? "●";
  return (
    <Box flexDirection="row">
      <Text color="green">{live}</Text>
      <Text dimColor> live</Text>
    </Box>
  );
}

function ClockText() {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <Text dimColor>{new Date().toLocaleTimeString()}</Text>;
}

export type DashHeaderProps = {
  width: number;
  ruleLen: number;
  keyboardInput: boolean;
  tasksCount: number;
  pipelineCount: number;
  historyCount: number;
};

export function DashHeader({
  width,
  ruleLen,
  keyboardInput,
  tasksCount,
  pipelineCount,
  historyCount,
}: DashHeaderProps) {
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1} width={width}>
      <Box flexDirection="row" alignItems="center" marginBottom={1}>
        <Text bold color="cyan">
          agent-farm
        </Text>
        <Text color="gray"> · </Text>
        <Text bold color="white">
          dashboard
        </Text>
        <Box marginLeft={1}>
          <LivePulse />
        </Box>
        <Spacer />
        <ClockText />
      </Box>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text dimColor italic>{keyboardInput ? "q / ESC 退出" : "非 TTY：Ctrl+C 结束"}</Text>
        <Text dimColor>
          队列 {tasksCount} 条 · 管线 {pipelineCount} · 归档 {historyCount}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{dimRule(ruleLen)}</Text>
      </Box>
    </Box>
  );
}
