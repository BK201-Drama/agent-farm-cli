import { Box, Text } from "ink";

export type LoadErrorPanelProps = {
  width: number;
  message: string;
};

function sqliteAbiHint(message: string): string | null {
  const m = message;
  if (!/better[_-]sqlite3|NODE_MODULE_VERSION/i.test(m)) return null;
  return [
    "当前 Node 与 better-sqlite3 原生二进制 ABI 不一致（常见于全局安装后切换了 nvm Node 版本）。",
    "修复：在 agent-farm-cli 安装目录执行 npm rebuild better-sqlite3，或 npm i -g agent-farm-cli@最新 重装；也可临时使用 AGENT_FARM_STORAGE=jsonl。",
  ].join(" ");
}

export function LoadErrorPanel({ width, message }: LoadErrorPanelProps) {
  const hint = sqliteAbiHint(message);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1} width={width}>
      <Text bold color="red">
        加载失败
      </Text>
      <Text dimColor wrap="wrap">
        {message}
      </Text>
      {hint ? (
        <Text color="yellow" wrap="wrap">
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}
