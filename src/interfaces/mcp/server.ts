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
import { decomposeRequirement } from "../../application/wave/decompose-service.js";

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

server.tool("farm_queue_view", "队列快照 + status + stuck + health（同 GET /api/view）", {}, async () => {
  try {
    return jsonResult(await service.buildView());
  } catch (err) {
    return jsonError(err);
  }
});

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

server.tool("farm_stuck_list", "仅返回 stuck 诊断条目", {}, async () => {
  try {
    const view = await service.buildView();
    return jsonResult(view.stuck);
  } catch (err) {
    return jsonError(err);
  }
});

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

// ── 决策仲裁 (Decision Arbitration) ──

server.tool(
  "farm_request_decision",
  "Worker 上报决策请求，farm 自动裁决或升级给人工。返回自动裁决结果或升级标记。",
  {
    task_id: z.string().min(1).describe("发起请求的 task ID"),
    decision_id: z.string().min(1).describe("worker 生成的唯一决策 ID"),
    context: z.string().min(1).describe("自然语言描述的决策上下文"),
    options: z.array(z.string()).min(1).describe("候选方案列表"),
    recommendation: z.string().optional().describe("worker 推荐的选项"),
    stage: z.enum(["execute", "verify", "ai_review"]).describe("触发决策的管线阶段"),
    attempt: z.number().int().min(0).describe("当前 task attempt 编号"),
  },
  async ({ task_id, decision_id, context, options, recommendation, stage, attempt }) => {
    try {
      return jsonResult(
        await service.requestDecision({
          task_id,
          decision_id,
          context,
          options,
          recommendation,
          stage,
          attempt,
        }),
      );
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_list_escalations",
  "列出所有待人工裁决的升级决策",
  {
    task_id: z.string().optional().describe("可选: 按 task ID 过滤"),
  },
  async ({ task_id }) => {
    try {
      return jsonResult(await service.listEscalations(task_id));
    } catch (err) {
      return jsonError(err);
    }
  },
);

server.tool(
  "farm_resolve_escalation",
  "解决升级决策。可选重置关联 task 为 retry 状态（注入决策上下文到 prompt）。",
  {
    escalation_id: z.string().min(1).describe("升级 ID"),
    choice: z.string().min(1).describe("最终选择的选项"),
    reason: z.string().min(1).describe("选择理由"),
    reset_task: z.boolean().optional().default(true).describe("是否将关联 task 从 awaiting_decision 转回 retry"),
  },
  async ({ escalation_id, choice, reason, reset_task }) => {
    try {
      return jsonResult(await service.resolveEscalation(escalation_id, choice, reason, reset_task));
    } catch (err) {
      return jsonError(err);
    }
  },
);

// ── 自动拆波 (Auto-Wave Decompose) ──

server.tool(
  "farm_decompose",
  "自然语言需求 → 自动拆解为 wave JSON（1 plan + N execute），返回经过校验的波次任务数组。" +
    "可选 --enqueue 直接入队。",
  {
    requirement: z.string().min(1, "需求描述不能为空").describe("自然语言需求描述（中文/英文均可）"),
    enqueue: z.boolean().optional().default(false).describe("是否拆解后自动入队"),
    model: z.string().optional().describe("LLM 模型覆盖；默认 claude-sonnet-5"),
    output: z.string().optional().describe("可选: 写入 JSON 文件的路径"),
  },
  async ({ requirement, enqueue, model, output }) => {
    try {
      const items = await decomposeRequirement(requirement, {
        model: model ?? undefined,
      });

      const result: Record<string, unknown> = { ok: true, tasks: items.length, wave: items };

      // Write to file if requested
      if (output) {
        const { writeFileSync, mkdirSync } = await import("node:fs");
        const { dirname, resolve } = await import("node:path");
        const outPath = resolve(output);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
        result.path = outPath;
      }

      // Enqueue if requested
      if (enqueue) {
        const { spawnSync } = await import("node:child_process");
        const { existsSync, writeFileSync, mkdirSync } = await import("node:fs");
        const { dirname, resolve, join } = await import("node:path");
        const { fileURLToPath } = await import("node:url");

        // Write wave to temp file for enqueue
        const tmpDir = join(process.cwd(), ".agent-farm", "waves");
        const slug = requirement.slice(0, 32).replace(/[^a-zA-Z0-9一-鿿]+/g, "-").toLowerCase();
        const wavePath = join(tmpDir, `decompose-${slug}-${Date.now()}.json`);
        mkdirSync(dirname(wavePath), { recursive: true });
        writeFileSync(wavePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");

        const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
        const script = join(root, "scripts", "enqueue-task-wave.mjs");
        if (!existsSync(script)) {
          result.enqueue_error = `enqueue 脚本未找到: ${script}`;
        } else {
          const r = spawnSync(process.execPath, [script, wavePath], {
            cwd: process.cwd(),
            encoding: "utf8",
            env: { ...process.env, AGENT_FARM_STORAGE: process.env.AGENT_FARM_STORAGE ?? "sqlite" },
          });
          result.enqueued = r.status === 0;
          if (r.status !== 0) {
            result.enqueue_error = r.stderr?.slice(-500) ?? `exit ${r.status}`;
          }
        }
      }

      return jsonResult(result);
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
