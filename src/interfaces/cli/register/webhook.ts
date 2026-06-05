/**
 * `agent-farm webhook` — 查看和测试 webhook 配置
 */
import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { WebhookConfig, WebhookPayload } from "../../../application/webhook/webhook-model.js";
import { sendWebhook } from "../../../infrastructure/webhook/http-webhook-sender.js";

function loadWebhooks(cwd: string): WebhookConfig[] {
  const configPath = join(cwd, ".agent-farm", "config.json");
  if (!existsSync(configPath)) return [];
  try {
    const raw = readFileSync(configPath, "utf8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    const hooks = cfg.webhooks;
    if (!Array.isArray(hooks)) return [];
    return hooks as WebhookConfig[];
  } catch {
    return [];
  }
}

export function registerWebhookCommands(program: Command): void {
  const webhook = program.command("webhook").description("Webhook 通知管理");

  webhook
    .command("list")
    .description("列出当前项目的 webhook 配置")
    .option("--cwd <path>", "工作目录", process.cwd())
    .action(async (opts) => {
      const hooks = loadWebhooks(opts.cwd);
      if (hooks.length === 0) {
        console.log("(无 webhook 配置)");
        console.log("\n在 .agent-farm/config.json 中添加 webhooks 数组即可启用：");
        console.log('  { "webhooks": [{ "url": "https://...", "events": ["task_done", "task_failed"] }] }');
        return;
      }
      for (const h of hooks) {
        console.log(`- ${h.url}`);
        console.log(`  事件: ${h.events.length > 0 ? h.events.join(", ") : "(全部)"}`);
        if (h.secret) console.log("  签名: HMAC-SHA256 (已设置)");
        console.log();
      }
    });

  webhook
    .command("test")
    .description("发送测试 webhook（验证 URL 可达）")
    .requiredOption("--url <url>", "Webhook URL")
    .option("--secret <secret>", "HMAC 密钥")
    .action(async (opts) => {
      const config: WebhookConfig = {
        url: opts.url,
        events: [],
        secret: opts.secret,
      };
      const payload: WebhookPayload = {
        event: "task_done",
        task_id: "test-webhook",
        status: "done",
        prompt_preview: "webhook test from agent-farm CLI",
        attempt: 0,
        finished_at: new Date().toISOString(),
      };
      const result = await sendWebhook(config, payload);
      if (result.ok) {
        console.log(`✓ 测试成功 (HTTP ${result.statusCode})`);
      } else {
        console.error(`✗ 测试失败: ${result.error ?? `HTTP ${result.statusCode}`}`);
        process.exitCode = 1;
      }
    });
}
