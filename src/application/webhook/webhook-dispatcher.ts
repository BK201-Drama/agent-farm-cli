/**
 * Webhook 调度器
 *
 * 从 AgentFarmProjectConfig 读取 webhooks 配置，
 * 在任务终态时构建 payload 并调用 HTTP sender 发送。
 */
import type { AgentFarmProjectConfig } from "../contracts/agent-farm-project-config.js";
import type { WebhookConfig, WebhookPayload, WebhookSendResult } from "./webhook-model.js";
import { sendWebhooks } from "../../infrastructure/webhook/http-webhook-sender.js";

const PROMPT_PREVIEW_MAX = 200;

function buildPayload(
  event: WebhookPayload["event"],
  task: Record<string, unknown>,
  finishedAt: string,
): WebhookPayload {
  const prompt = String(task.prompt ?? "");
  return {
    event,
    task_id: String(task.task_id ?? ""),
    status: String(task.status ?? ""),
    prompt_preview: prompt.slice(0, PROMPT_PREVIEW_MAX),
    attempt: Number(task.attempt ?? 0),
    finished_at: finishedAt,
    error: "last_error" in task ? String(task.last_error ?? "").slice(0, 500) || undefined : undefined,
  };
}

export type WebhookDispatcher = {
  notify(event: WebhookPayload["event"], task: Record<string, unknown>, finishedAt: string): Promise<WebhookSendResult[]>;
};

export function createWebhookDispatcher(projectConfig: AgentFarmProjectConfig | null): WebhookDispatcher | null {
  const configs: WebhookConfig[] = (projectConfig as Record<string, unknown> | null)?.webhooks as WebhookConfig[] | undefined ?? [];
  if (!Array.isArray(configs) || configs.length === 0) return null;

  return {
    async notify(event, task, finishedAt) {
      const payload = buildPayload(event, task, finishedAt);
      return sendWebhooks(configs, payload);
    },
  };
}
