import type { EventRecord } from "../../domain/event.js";
import { nowIso, type JsonMap } from "../../infrastructure/persistence/jsonl/jsonl-utils.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import type { QueueService } from "../services/queue-service.js";
import { resolveAiReviewCommandTemplate } from "./ai-review-template.js";
import { buildTemplateContextFromTask, expandCommandTemplate } from "./command-template.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import { buildWorkerChildEnv } from "./task-runtime-env.js";
import {
  AI_REVIEW_ERROR_CAP,
  AI_REVIEW_FIX_PROMPT_APPEND_CAP,
  AI_REVIEW_RESULT_SNIPPET_CAP,
  EXEC_OUTPUT_CAP,
  VERIFY_ERROR_CAP,
} from "./worker-output-limits.js";

export type ProcessClaimedTaskDeps = {
  task: JsonMap;
  workspaceDir: string;
  runsDir: string;
  commandTemplate: string;
  verifyCommandTemplate: string;
  aiReviewCommandTemplate: string;
  requireAiReview: boolean;
  autoApproveReview: boolean;
  queueService: QueueService;
  eventRepo: EventRepository;
  runShell: ShellRunner;
};

function ev(payload: EventRecord): EventRecord {
  return payload;
}

export async function processClaimedTask(deps: ProcessClaimedTaskDeps): Promise<void> {
  const { task, workspaceDir: workspace, runsDir, queueService, eventRepo } = deps;
  const taskId = String(task.task_id ?? "");
  const tplCtx = () => buildTemplateContextFromTask(task, runsDir, workspace);
  const env = buildWorkerChildEnv(task, runsDir, workspace);
  const heartbeat = async () => {
    await queueService.touchHeartbeat(taskId);
  };

  if (await queueService.hasActiveDuplicateDedupeForTask(task)) {
    await queueService.updateStatus(taskId, "blocked", {
      blocked_reason: `duplicate dedupe_key: ${String(task.dedupe_key ?? "")}`,
    });
    await eventRepo.append(
      ev({
        ts: nowIso(),
        event: "task_deduped_blocked",
        task_id: taskId,
        dedupe_key: String(task.dedupe_key ?? ""),
      })
    );
    return;
  }

  await queueService.updateStatus(taskId, "running");
  await eventRepo.append(ev({ ts: nowIso(), event: "task_running", task_id: taskId }));

  const cmd = expandCommandTemplate(deps.commandTemplate, tplCtx());
  const result = await deps.runShell(cmd, { onHeartbeat: heartbeat, env });
  if (result.exitCode !== 0) {
    const attempt = Number(task.attempt ?? 0);
    await queueService.updateStatus(taskId, "retry", {
      attempt: attempt + 1,
      last_error: result.output.slice(0, EXEC_OUTPUT_CAP),
    });
    await eventRepo.append(
      ev({
        ts: nowIso(),
        event: "task_failed",
        task_id: taskId,
        attempt: attempt + 1,
        stage: "execute",
      })
    );
    await eventRepo.append(
      ev({
        ts: nowIso(),
        event: "task_retry",
        task_id: taskId,
        attempt: attempt + 1,
        stage: "execute",
      })
    );
    return;
  }

  if (String(deps.verifyCommandTemplate ?? "").trim()) {
    const verifyCmd = expandCommandTemplate(String(deps.verifyCommandTemplate), tplCtx());
    const verifyResult = await deps.runShell(verifyCmd, { onHeartbeat: heartbeat, env });
    if (verifyResult.exitCode !== 0) {
      const attempt = Number(task.attempt ?? 0);
      await queueService.updateStatus(taskId, "retry", {
        attempt: attempt + 1,
        last_error: `verify failed\n${verifyResult.output.slice(0, VERIFY_ERROR_CAP)}`,
      });
      await eventRepo.append(
        ev({
          ts: nowIso(),
          event: "task_failed",
          task_id: taskId,
          attempt: attempt + 1,
          stage: "verify",
        })
      );
      await eventRepo.append(
        ev({
          ts: nowIso(),
          event: "task_retry",
          task_id: taskId,
          attempt: attempt + 1,
          stage: "verify",
        })
      );
      return;
    }
  }

  const aiTpl = resolveAiReviewCommandTemplate(task, String(deps.aiReviewCommandTemplate ?? ""));
  if (deps.requireAiReview && task.skip_ai_review !== true && !aiTpl) {
    await queueService.updateStatus(taskId, "blocked", {
      blocked_reason:
        "require-ai-review: missing template (set worker --ai-review-command-template or task ai_review_command_template)",
    });
    await eventRepo.append(
      ev({
        ts: nowIso(),
        event: "task_blocked",
        task_id: taskId,
        reason: "require_ai_review_no_template",
      })
    );
    return;
  }

  let aiReviewOutput: string | undefined;
  if (aiTpl) {
    const aiCmd = expandCommandTemplate(aiTpl, tplCtx());
    const aiResult = await deps.runShell(aiCmd, { onHeartbeat: heartbeat, env });
    aiReviewOutput = aiResult.output;
    if (aiResult.exitCode !== 0) {
      const attempt = Number(task.attempt ?? 0);
      const fixBlock = aiResult.output.slice(0, AI_REVIEW_FIX_PROMPT_APPEND_CAP);
      await queueService.updateStatus(taskId, "retry", {
        attempt: attempt + 1,
        last_error: `ai-review failed\n${aiResult.output.slice(0, AI_REVIEW_ERROR_CAP)}`,
        prompt: `${String(task.prompt ?? "")}\n\n[ai-review-fix]\n${fixBlock}`,
      });
      await eventRepo.append(
        ev({
          ts: nowIso(),
          event: "task_failed",
          task_id: taskId,
          attempt: attempt + 1,
          stage: "ai_review",
        })
      );
      await eventRepo.append(
        ev({
          ts: nowIso(),
          event: "task_retry",
          task_id: taskId,
          attempt: attempt + 1,
          stage: "ai_review",
        })
      );
      return;
    }
    await eventRepo.append(ev({ ts: nowIso(), event: "task_ai_review_ok", task_id: taskId }));
  }

  const reviewExtra: JsonMap = {
    result: { exit_code: 0, output: result.output.slice(0, EXEC_OUTPUT_CAP) },
  };
  if (aiReviewOutput !== undefined) {
    (reviewExtra.result as JsonMap).ai_review_output = aiReviewOutput.slice(0, AI_REVIEW_RESULT_SNIPPET_CAP);
  }
  await queueService.updateStatus(taskId, "review", reviewExtra);
  await eventRepo.append(ev({ ts: nowIso(), event: "task_review", task_id: taskId }));
  if (deps.autoApproveReview) {
    await queueService.updateStatus(taskId, "approved");
    await queueService.updateStatus(taskId, "done");
    await eventRepo.append(ev({ ts: nowIso(), event: "task_done", task_id: taskId }));
  }
}
