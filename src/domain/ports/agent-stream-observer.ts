/** Agent 流输出摘要（execute/verify/ai-review 阶段 NDJSON 解析结果） */
export interface AgentStreamSummary {
  linesOk: number;
  linesInvalid: number;
  errorSnippets: string[];
  toolIssues: string[];
  toolCallCount: number;
}

/** Agent 流观察器：接收 stdout/stderr 行并产出摘要和自愈提示 */
export interface AgentStreamObserver {
  onStdoutLine(line: string): void;
  onStderrLine(line: string): void;
  snapshot(): AgentStreamSummary;
  healAppendixForRetry(): string;
}
