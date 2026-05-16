#!/usr/bin/env node
/**
 * agent-farm MCP（stdio）：与 control-plane /api/view 同源。
 * Cursor 配置见 docs/integrations/cursor-control-plane.md
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ControlPlaneService } from "../../application/facades/control-plane.js";

const service = new ControlPlaneService(process.cwd());

const server = new McpServer({
  name: "agent-farm",
  version: "0.1.45",
});

server.tool(
  "farm_queue_view",
  "队列快照 + status + stuck（同 control-plane /api/view）",
  {},
  async () => {
    try {
      const view = await service.buildView();
      return {
        content: [{ type: "text", text: JSON.stringify(view, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }],
      };
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
      return {
        content: [{ type: "text", text: JSON.stringify(view.stuck, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }],
      };
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
      const result = await service.dispatchPrompt(prompt, dedupe_key);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }],
      };
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
