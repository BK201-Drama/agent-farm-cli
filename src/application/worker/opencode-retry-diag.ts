import type { EventRecord } from "../../domain/event.js";
import type { IsoClock } from "../../domain/ports/clock.js";
import type { EventRepository } from "../../domain/ports/repositories.js";
import { stripOpencodeHealAppendix } from "../../infrastructure/opencode/opencode-json-stream.js";
import { stripClaudeHealAppendix } from "../../infrastructure/claude-code/claude-code-json-stream.js";
import { stripAiReviewFixAppendix } from "./ai-review-template.js";
import { stripVerifyFailAppendix } from "./acceptance-check.js";
import type { AgentStreamObserver } from "./run-opencode-aware-shell.js";

function ev(payload: EventRecord): EventRecord {
  return payload;
}

export function basePromptForRetry(prompt: string): string {
  return stripOpencodeHealAppendix(stripClaudeHealAppendix(stripAiReviewFixAppendix(stripVerifyFailAppendix(prompt))));
}

export function healBlockFromObserver(streamObs: AgentStreamObserver | undefined): string {
  if (!streamObs) return "";
  const snap = streamObs.snapshot();
  const shouldHeal =
    snap.linesOk > 0 || snap.linesInvalid > 0 || snap.errorSnippets.length > 0 || snap.toolIssues.length > 0;
  return shouldHeal ? streamObs.healAppendixForRetry() : "";
}

export async function emitOpencodeStreamDiag(
  eventRepo: EventRepository,
  clock: IsoClock,
  taskId: string,
  attemptPlus1: number,
  stage: "execute" | "verify" | "ai_review",
  streamObs: AgentStreamObserver | undefined,
): Promise<void> {
  if (!streamObs) return;
  const snap = streamObs.snapshot();
  await eventRepo.append(
    ev({
      ts: clock(),
      event: "task_agent_stream_diag",
      task_id: taskId,
      attempt: attemptPlus1,
      stage,
      lines_ok: snap.linesOk,
      lines_invalid: snap.linesInvalid,
      error_snippets: snap.errorSnippets.slice(0, 3),
      tool_issues: snap.toolIssues.slice(0, 3),
    }),
  );
}
