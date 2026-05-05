import { useEffect, useState } from "react";
import { Box, Spacer, Text } from "ink";
import { clipPrompt, dimRule } from "../helpers.js";

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
  lastOk?: Date | null;
  /** 全任务状态计数紧凑串 */
  statusCompact?: string;
  /** 未进入管线/归档的任务数 */
  otherStatusCount?: number;
  /** 队列数据根（cwd / storage / db 或 jsonl） */
  storageLines?: string[];
};

export function DashHeader({
  width,
  ruleLen,
  keyboardInput,
  tasksCount,
  pipelineCount,
  historyCount,
  lastOk = null,
  statusCompact = "",
  otherStatusCount = 0,
  storageLines = [],
}: DashHeaderProps) {
  const summary = `队列${tasksCount}·管线${pipelineCount}·归档${historyCount}${
    otherStatusCount > 0 ? `·其它${otherStatusCount}` : ""
  }`;
  const statusLine = statusCompact ? clipPrompt(statusCompact, Math.max(20, width - 4)) : "";

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={0} width={width}>
      <Box flexDirection="row" alignItems="center" marginBottom={0}>
        <Text bold color="cyan">
          agent-farm
        </Text>
        <Text color="gray">·</Text>
        <Text bold color="white">
          dashboard
        </Text>
        <Box marginLeft={1}>
          <LivePulse />
        </Box>
        <Spacer />
        <ClockText />
      </Box>
      <Box flexDirection="column" marginTop={0}>
        <Text dimColor italic wrap="wrap">
          {(keyboardInput ? "q/ESC退出 " : "非TTY Ctrl+C ") + summary}
        </Text>
        {statusLine ? (
          <Text dimColor wrap="wrap">
            {statusLine}
          </Text>
        ) : null}
        {lastOk ? (
          <Text dimColor>
            拉取 {lastOk.toLocaleTimeString()}
          </Text>
        ) : null}
        {storageLines.length > 0
          ? storageLines.map((line, i) => (
              <Text key={`${i}:${line.slice(0, 24)}`} dimColor wrap="wrap">
                {clipPrompt(line, Math.max(24, width - 2))}
              </Text>
            ))
          : null}
      </Box>
      <Box marginTop={0}>
        <Text dimColor>{dimRule(ruleLen)}</Text>
      </Box>
    </Box>
  );
}
