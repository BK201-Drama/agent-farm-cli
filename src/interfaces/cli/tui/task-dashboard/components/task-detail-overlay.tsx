import { Box, Text } from "ink";
import type { TaskRecord } from "../../../../../domain/task.js";
import { clipPrompt, relativeShort } from "../helpers.js";

function pick(t: TaskRecord, key: string): string {
  return String((t as Record<string, unknown>)[key] ?? "");
}

export type TaskDetailOverlayProps = {
  task: TaskRecord;
  width: number;
};

export function TaskDetailOverlay({ task, width }: TaskDetailOverlayProps) {
  const id = String(task.task_id ?? "—");
  const pr = String(task.prompt ?? "");
  const st = String(task.status ?? "—");
  const mode = String(task.mode ?? "—");
  const topic = String(task.topic ?? "—");
  const dedupe = String(task.dedupe_key ?? "—");
  const hb = pick(task, "heartbeat_at");
  const started = pick(task, "started_at");
  const claimed = pick(task, "claimed_at");
  const lastErr = pick(task, "last_error");
  const blocked = pick(task, "blocked_reason");
  const json = JSON.stringify(task, null, 2);
  const jsonClipped = clipPrompt(json.replace(/\s+/g, " "), Math.max(40, width * 3));

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      paddingY={0}
      marginBottom={0}
      width={width}
    >
      <Text bold color="yellow">
        详情 ESC/q
      </Text>
      <Box marginTop={0} flexDirection="column">
        <Text dimColor>task_id</Text>
        <Text>{clipPrompt(id, width - 4)}</Text>
        <Text dimColor>status · mode · topic</Text>
        <Text wrap="wrap">
          {st} · {mode} · {topic}
        </Text>
        <Text dimColor>dedupe_key</Text>
        <Text>{clipPrompt(dedupe, width - 4)}</Text>
        <Text dimColor>hb · started · claimed（距现在）</Text>
        <Text wrap="wrap">
          {hb ? relativeShort(hb) : "—"} · {started ? relativeShort(started) : "—"} · {claimed ? relativeShort(claimed) : "—"}
        </Text>
        {(lastErr || blocked) ? (
          <>
            <Text dimColor>last_error / blocked_reason</Text>
            <Text color="red" wrap="wrap">
              {clipPrompt(lastErr || blocked, width - 2)}
            </Text>
          </>
        ) : null}
        <Text dimColor>prompt</Text>
        <Text wrap="wrap">{pr || "—"}</Text>
        <Box marginTop={0}>
          <Text dimColor>JSON</Text>
        </Box>
        <Text dimColor wrap="wrap">
          {jsonClipped}
        </Text>
      </Box>
    </Box>
  );
}
