/**
 * Webhook 配置领域类型
 *
 * 定义 webhook 配置和事件载体，供应用层和基础设施层使用。
 */

/** 触发 webhook 的任务事件 */
export type WebhookTaskEvent =
  | "task_done"
  | "task_failed"
  | "task_retry"
  | "task_blocked"
  | "task_review";

export const WEBHOOK_TASK_EVENTS: readonly WebhookTaskEvent[] = [
  "task_done",
  "task_failed",
  "task_retry",
  "task_blocked",
  "task_review",
] as const;

/** 单个 webhook 端点配置 */
export type WebhookConfig = {
  /** POST 目标 URL */
  url: string;
  /** 触发事件列表；空数组 = 全部事件 */
  events: WebhookTaskEvent[];
  /** 可选 HMAC-SHA256 签名密钥 */
  secret?: string;
};

/** POST 到 webhook 的 JSON body */
export type WebhookPayload = {
  event: WebhookTaskEvent;
  task_id: string;
  status: string;
  prompt_preview: string;
  attempt: number;
  finished_at: string;
  error?: string;
};

/** Webhook 发送结果 */
export type WebhookSendResult = {
  ok: boolean;
  url: string;
  statusCode?: number;
  error?: string;
};
