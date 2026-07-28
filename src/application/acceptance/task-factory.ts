/**
 * Spec Acceptance Runtime — 任务工厂
 *
 * 将验收 spec 中的 item 转换为可入队的 task JSON。
 * 应用层通过 `buildTaskForItem(spec, item)` 调用。
 */
import type { JsonMap } from "../../domain/task/model.js";
import { acceptanceTaskKey } from "./acceptance-task-key.js";
import type { AcceptanceItemSpec, AcceptanceSpec } from "./types.js";

/**
 * 为单条验收项构造可入队的 task JSON。
 *
 * - task_id / dedupe_key 使用 `acceptance__{poc_id}__{item.id}`（Windows 路径安全）
 * - mode = "execute"
 * - 若 !needs_human，设 acceptance_criteria = item.verify
 * - 始终附加 spec_acceptance 元数据供 reconcile 使用
 */
export function buildTaskForItem(
  spec: AcceptanceSpec,
  item: AcceptanceItemSpec,
): JsonMap {
  const taskId = acceptanceTaskKey(spec.poc_id, item.id);

  const task: JsonMap = {
    task_id: taskId,
    dedupe_key: taskId,
    mode: "execute",
    prompt: `Acceptance check: ${item.title}`,
    spec_acceptance: {
      poc_id: spec.poc_id,
      item_id: item.id,
      needs_human: item.needs_human,
    },
    read_path: spec.code_root,
  };

  if (!item.needs_human) {
    task.acceptance_criteria = item.verify;
  }

  return task;
}
