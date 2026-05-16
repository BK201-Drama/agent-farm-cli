#!/usr/bin/env node
/**
 * agent-farm MCP（stdio）：与 control-plane HTTP API 同源。
 * Cursor 配置见 docs/integrations/cursor-control-plane.md
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createControlPlaneService } from "../../bootstrap/create-control-plane-service.js";
import { readCliPackageVersion } from "../cli/version.js";

const service = createControlPlaneService(process.cwd());

const server = new McpServer({
  name: "agent-farm",
  version: readCliPackageVersion(),
});

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function jsonError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: msg }) }],
  };
}

server.tool(
  "farm_queue_view",
  "队列快照 + status + stuck + health（同 GET /api/view）",
  {},
  async () => {
    try {
      return jsonResult(await service.buildView());
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_control_plane_health",
  "轻量健康（同 GET /api/health）：worker_hint、queue_cwd、version",
  {},
  async () => {
    try {
      return jsonResult(await service.buildHealth());
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_stuck_list",
  "仅返回 stuck 诊断条目",
  {},
  async () => {
    try {
      const view = await service.buildView();
      return jsonResult(view.stuck);
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_dispatch_task",
  "将一条 prompt 入队（execute 模式）",
  {
    prompt: z.string().min(1, "prompt 不能为空").describe("任务描述（必填）"),
    dedupe_key: z.string().optional().describe("可选 dedupe_key"),
  },
  async ({ prompt, dedupe_key }) => {
    try {
      return jsonResult(await service.dispatchPrompt(prompt, dedupe_key));
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_stuck_retry",
  "单任务标为 retry（同 POST /api/stuck/retry）",
  {
    task_id: z.string().min(1),
    reason: z.string().optional(),
  },
  async ({ task_id, reason }) => {
    try {
      return jsonResult(await service.stuckRetry(task_id, reason));
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_stuck_recover",
  "批量 recover-stale（同 POST /api/stuck/recover）",
  {
    lease_timeout_seconds: z.number().int().positive().optional(),
  },
  async ({ lease_timeout_seconds }) => {
    try {
      return jsonResult(await service.stuckRecover(lease_timeout_seconds ?? 1800));
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_stuck_review_approve",
  "review 任务 approve（同 POST /api/stuck/review-approve）",
  {
    task_id: z.string().min(1),
    reviewer: z.string().optional(),
  },
  async ({ task_id, reviewer }) => {
    try {
      return jsonResult(await service.stuckReviewApprove(task_id, reviewer));
    } catch (err) {
      return jsonError(err);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
