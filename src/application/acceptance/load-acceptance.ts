/**
 * Spec Acceptance Runtime — 加载验收规格并入队任务
 *
 * 读取 JSON spec → 解析 → 初始化/合并进度 → 写入进度文件 → 将 pending
 * 项入队（已有同 dedupe 的任务则跳过；blocked 项留待依赖满足后再入队）。
 */
import * as fs from "node:fs/promises";
import type { JsonMap, TaskRecord } from "../../domain/task/model.js";
import { acceptanceTaskKey } from "./acceptance-task-key.js";
import { parseAcceptanceSpecJson } from "./parse-spec.js";
import {
  acceptanceProgressPath,
  initProgressFromSpec,
  readProgress,
  writeProgress,
} from "./progress-store.js";
import type { AcceptanceItemState, AcceptanceProgress, AcceptanceSpec } from "./types.js";
import { buildTaskForItem } from "./task-factory.js";

export type EnqueueFn = (task: JsonMap) => Promise<TaskRecord>;

export interface LoadAcceptanceOptions {
  specFilePath: string;
  farmRoot: string;
  enqueue: EnqueueFn;
  /**
   * 队列中已存在的 dedupe_key 集合。
   * 若某 pending 项的 key 已在集合中，则跳过入队（幂等 reload）。
   */
  existingDedupeKeys?: ReadonlySet<string>;
}

export interface LoadAcceptanceResult {
  spec: AcceptanceSpec;
  progress: AcceptanceProgress;
  enqueuedCount: number;
  skippedExistingCount: number;
}

function mergeProgressWithSpec(
  existing: AcceptanceProgress,
  spec: AcceptanceSpec,
  nowIso: string,
): AcceptanceProgress {
  const items: AcceptanceProgress["items"] = { ...existing.items };
  for (const item of spec.items) {
    if (items[item.id] !== undefined) continue;
    const unmet = item.depends_on.some((depId) => items[depId] !== "pass");
    const blockedByMissing = item.depends_on.length > 0 && unmet;
    items[item.id] = blockedByMissing ? "blocked" : "pending";
  }
  return {
    ...existing,
    poc_id: spec.poc_id,
    code_root: spec.code_root,
    updated_at: nowIso,
    items,
    spec_snapshot: spec,
    demo: existing.demo === "pass" || existing.demo === "ready" || existing.demo === "running" || existing.demo === "fail"
      ? existing.demo
      : existing.demo,
  };
}

/**
 * 加载验收规格：读取 JSON → 解析 → 合并/初始化进度 → 入队尚未存在的 pending 项。
 */
export async function loadAcceptanceSpec(
  opts: LoadAcceptanceOptions,
): Promise<LoadAcceptanceResult> {
  const raw = await fs.readFile(opts.specFilePath, "utf-8");
  const spec = parseAcceptanceSpecJson(JSON.parse(raw));
  const nowIso = new Date().toISOString();
  const progressPath = acceptanceProgressPath(opts.farmRoot, spec.poc_id);

  const previous = await readProgress(progressPath);
  const progress =
    previous && previous.poc_id === spec.poc_id
      ? mergeProgressWithSpec(previous, spec, nowIso)
      : initProgressFromSpec(spec, nowIso);

  await writeProgress(progressPath, progress);

  const existing = opts.existingDedupeKeys ?? new Set<string>();
  let enqueuedCount = 0;
  let skippedExistingCount = 0;

  for (const item of spec.items) {
    const state: AcceptanceItemState | undefined = progress.items[item.id];
    if (state !== "pending") continue;

    const key = acceptanceTaskKey(spec.poc_id, item.id);
    if (existing.has(key)) {
      skippedExistingCount++;
      continue;
    }

    const task = buildTaskForItem(spec, item);
    await opts.enqueue(task);
    enqueuedCount++;
  }

  return { spec, progress, enqueuedCount, skippedExistingCount };
}
