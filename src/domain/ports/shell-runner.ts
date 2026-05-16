/** 出站端口：子进程执行（基础设施提供默认实现，测试可注入 mock） */
export type ShellRunOptions = {
  onHeartbeat?: () => Promise<void>;
  heartbeatMs?: number;
  env?: NodeJS.ProcessEnv;
  /** 按行消费子进程 stdout；用于 NDJSON / stream-json 类输出 */
  onStdoutLine?: (line: string) => void;
  /** 按行消费 stderr（部分 CLI 将事件打到 stderr） */
  onStderrLine?: (line: string) => void;
  /**
   * 覆盖 `AGENT_FARM_SHELL_TIMEOUT_MS`：到时 `kill` 子进程，避免 bash/管道僵死导致 worker 永久 `running`。
   * 未设置且环境变量也未配置时：无超时（与历史行为一致）。
   */
  timeoutMs?: number;
  /** 与心跳同频轮询；返回 true 时终止子进程（用于空转检测等）。 */
  shouldAbort?: () => Promise<boolean>;
};

export type ShellRunner = (
  command: string,
  options?: ShellRunOptions
) => Promise<{ exitCode: number; output: string }>;
