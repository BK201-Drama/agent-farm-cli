/** 出站端口：子进程执行（基础设施提供默认实现，测试可注入 mock） */
export type ShellRunOptions = {
  onHeartbeat?: () => Promise<void>;
  heartbeatMs?: number;
  env?: NodeJS.ProcessEnv;
  /** 按行消费子进程 stdout；用于 NDJSON / stream-json 类输出 */
  onStdoutLine?: (line: string) => void;
  /** 按行消费 stderr（部分 CLI 将事件打到 stderr） */
  onStderrLine?: (line: string) => void;
};

export type ShellRunner = (
  command: string,
  options?: ShellRunOptions
) => Promise<{ exitCode: number; output: string }>;
