/**
 * Webhook 调度器单元测试
 */
import { describe, expect, it, vi } from "vitest";

describe("webhook model", () => {
  it("WEBHOOK_TASK_EVENTS contains all task events", async () => {
    const { WEBHOOK_TASK_EVENTS } = await import("../../src/application/webhook/webhook-model.js");
    expect(WEBHOOK_TASK_EVENTS).toContain("task_done");
    expect(WEBHOOK_TASK_EVENTS).toContain("task_failed");
    expect(WEBHOOK_TASK_EVENTS).toContain("task_retry");
    expect(WEBHOOK_TASK_EVENTS).toContain("task_blocked");
    expect(WEBHOOK_TASK_EVENTS).toContain("task_review");
    expect(WEBHOOK_TASK_EVENTS.length).toBe(5);
  });
});

describe("webhook dispatcher", () => {
  it("returns null when no webhook config", async () => {
    const { createWebhookDispatcher } = await import("../../src/application/webhook/webhook-dispatcher.js");
    const d = createWebhookDispatcher(null);
    expect(d).toBeNull();
  });

  it("returns null when webhooks array is empty", async () => {
    const { createWebhookDispatcher } = await import("../../src/application/webhook/webhook-dispatcher.js");
    const d = createWebhookDispatcher({ webhooks: [] } as unknown as Parameters<typeof createWebhookDispatcher>[0]);
    expect(d).toBeNull();
  });

  it("creates dispatcher when webhooks are configured", async () => {
    const { createWebhookDispatcher } = await import("../../src/application/webhook/webhook-dispatcher.js");
    const cfg = { webhooks: [{ url: "https://example.com/hook", events: ["task_done"] }] };
    const d = createWebhookDispatcher(cfg as unknown as Parameters<typeof createWebhookDispatcher>[0]);
    expect(d).not.toBeNull();
    expect(d?.notify).toBeDefined();
  });
});

describe("http webhook sender", () => {
  it("sendWebhook posts JSON to URL", async () => {
    const { sendWebhook } = await import("../../src/infrastructure/webhook/http-webhook-sender.js");
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendWebhook(
      { url: "https://hooks.example.com/test", events: [] },
      {
        event: "task_done",
        task_id: "t1",
        status: "done",
        prompt_preview: "test",
        attempt: 1,
        finished_at: "2026-01-01T00:00:00Z",
      },
    );

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/test");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.task_id).toBe("t1");
    expect(body.event).toBe("task_done");

    vi.unstubAllGlobals();
  });

  it("sendWebhook adds HMAC signature when secret is set", async () => {
    const { sendWebhook } = await import("../../src/infrastructure/webhook/http-webhook-sender.js");
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    await sendWebhook(
      { url: "https://hooks.example.com/test", events: [], secret: "mysecret" },
      {
        event: "task_done",
        task_id: "t1",
        status: "done",
        prompt_preview: "test",
        attempt: 1,
        finished_at: "2026-01-01T00:00:00Z",
      },
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-agent-farm-signature"]).toMatch(/^sha256=/);
    expect(headers["x-agent-farm-event"]).toBe("task_done");

    vi.unstubAllGlobals();
  });

  it("sendWebhook returns error on fetch failure", async () => {
    const { sendWebhook } = await import("../../src/infrastructure/webhook/http-webhook-sender.js");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const result = await sendWebhook(
      { url: "https://bad.example.com/hook", events: [] },
      {
        event: "task_done",
        task_id: "t1",
        status: "done",
        prompt_preview: "test",
        attempt: 1,
        finished_at: "2026-01-01T00:00:00Z",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");

    vi.unstubAllGlobals();
  });
});

describe("sendWebhooks batch", () => {
  it("filters by event type", async () => {
    const { sendWebhooks } = await import("../../src/infrastructure/webhook/http-webhook-sender.js");
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "task_done" as const,
      task_id: "t1",
      status: "done",
      prompt_preview: "test",
      attempt: 1,
      finished_at: "2026-01-01T00:00:00Z",
    };

    const configs = [
      { url: "https://a.example.com/hook", events: ["task_done"] },
      { url: "https://b.example.com/hook", events: ["task_failed"] },
    ];

    const results = await sendWebhooks(configs, payload);
    expect(results).toHaveLength(1); // only the task_done hook should fire
    expect(results[0]!.url).toBe("https://a.example.com/hook");

    vi.unstubAllGlobals();
  });

  it("sends to all when events is empty", async () => {
    const { sendWebhooks } = await import("../../src/infrastructure/webhook/http-webhook-sender.js");
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "task_done" as const,
      task_id: "t1",
      status: "done",
      prompt_preview: "test",
      attempt: 1,
      finished_at: "2026-01-01T00:00:00Z",
    };

    const configs = [
      { url: "https://a.example.com/hook", events: [] },
      { url: "https://b.example.com/hook", events: [] },
    ];

    const results = await sendWebhooks(configs, payload);
    expect(results).toHaveLength(2);

    vi.unstubAllGlobals();
  });
});
