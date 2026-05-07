import { memo } from "react";
import { Box, Spacer, Text } from "ink";
import { clipPrompt, dimRule } from "../helpers/index.js";

/** 静态 live 标记：避免 500ms/1s 定时器在部分终端上触发 Ink 增量更新错位、顶栏重复堆叠 */
function LiveIndicator() {
  return (
    <Box flexDirection="row">
      <Text color="green">●</Text>
      <Text dimColor> live</Text>
    </Box>
  );
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

export const DashHeader = memo(function DashHeader({
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
          <LiveIndicator />
        </Box>
        <Spacer />
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
});
