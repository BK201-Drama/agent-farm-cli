/**
 * Spec Acceptance Runtime — Zod 解析器
 *
 * 将未知 JSON 输入解析为 `AcceptanceSpec`，包含跨字段/跨条目校验。
 * 应用层通过 `parseAcceptanceSpecJson(raw)` 调用。
 */
import { z } from "zod";
import type { AcceptanceSpec } from "./types.js";

// ── AcceptanceItemSpec ──────────────────────────────────────────────

const AcceptanceItemSpecSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    verify: z.string().nullable(),
    needs_human: z.boolean().default(false),
    depends_on: z.array(z.string()).default([]),
  })
  .refine(
    (item) => item.needs_human === true || (item.verify !== null && item.verify.length > 0),
    {
      message: "verify must be a non-empty string when needs_human is not true",
      path: ["verify"],
    },
  );

// ── AcceptanceDemoSpec ──────────────────────────────────────────────

const AcceptanceDemoSpecSchema = z.object({
  id: z.string().min(1),
  how: z.string().optional(),
  verify: z.string().min(1),
});

// ── AcceptanceSpec ──────────────────────────────────────────────────

const AcceptanceSpecSchema = z
  .object({
    poc_id: z.string().min(1),
    code_root: z.string().min(1),
    demo: AcceptanceDemoSpecSchema,
    items: z.array(AcceptanceItemSpecSchema).min(1),
  })
  .refine(
    (spec) => {
      const itemIds = new Set(spec.items.map((i) => i.id));
      for (const item of spec.items) {
        for (const depId of item.depends_on) {
          if (!itemIds.has(depId)) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message: "every depends_on id must reference an existing item id in items",
    },
  );

// ── Public API ──────────────────────────────────────────────────────

/**
 * 解析未知 JSON 输入为类型安全的 `AcceptanceSpec`。
 * 校验失败时抛出 `ZodError`。
 */
export function parseAcceptanceSpecJson(raw: unknown): AcceptanceSpec {
  return AcceptanceSpecSchema.parse(raw) as AcceptanceSpec;
}
