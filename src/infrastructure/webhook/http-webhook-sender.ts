/**
 * Webhook HTTP 发送器
 *
 * 向配置的 URL POST JSON payload，支持可选的 HMAC-SHA256 签名。
 * 单次超时 10s，失败仅 console.error — 不阻断 worker。
 */
import { createHmac } from "node:crypto";
import type { WebhookConfig, WebhookPayload, WebhookSendResult } from "../../application/webhook/webhook-model.js";

const FETCH_TIMEOUT_MS = 10_000;

function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function postWithTimeout(url: string, body: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", ...headers },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendWebhook(config: WebhookConfig, payload: WebhookPayload): Promise<WebhookSendResult> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {};
  if (config.secret) {
    headers["x-agent-farm-signature"] = `sha256=${signBody(config.secret, body)}`;
    headers["x-agent-farm-event"] = payload.event;
  }
  try {
    const res = await postWithTimeout(config.url, body, headers);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[agent-farm] webhook ${config.url} returned ${res.status}: ${text.slice(0, 500)}`);
      return { ok: false, url: config.url, statusCode: res.status, error: text.slice(0, 200) };
    }
    return { ok: true, url: config.url, statusCode: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent-farm] webhook ${config.url} failed: ${msg}`);
    return { ok: false, url: config.url, error: msg };
  }
}

/**
 * 批量发送 webhook（并发，各目标独立容错）。
 * 仅发送 events 列表包含该事件类型的 webhook（空列表 = 全部）。
 */
export async function sendWebhooks(
  configs: WebhookConfig[],
  payload: WebhookPayload,
): Promise<WebhookSendResult[]> {
  const matching = configs.filter((c) => c.events.length === 0 || c.events.includes(payload.event));
  if (matching.length === 0) return [];
  const results = await Promise.all(matching.map((c) => sendWebhook(c, payload)));
  return results;
}
