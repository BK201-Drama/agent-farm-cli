/** 出站端口：子进程执行（基础设施提供默认实现，测试可注入 mock） */
export type ShellRunOptions = {
  onHeartbeat?: () => Promise<void>;
  heartbeatMs?: number;
  env?: NodeJS.ProcessEnv;
};

export type ShellRunner = (
  command: string,
  options?: ShellRunOptions
) => Promise<{ exitCode: number; output: string }>;
