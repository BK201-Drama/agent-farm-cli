import { Box, Text } from "ink";
import type { TaskRecord } from "../../../../../domain/task.js";
import { clipPrompt } from "../helpers.js";

export type TaskDetailOverlayProps = {
  task: TaskRecord;
  width: number;
};

export function TaskDetailOverlay({ task, width }: TaskDetailOverlayProps) {
  const id = String(task.task_id ?? "—");
  const pr = String(task.prompt ?? "");
  const st = String(task.status ?? "—");
  const mode = String(task.mode ?? "—");
  const dedupe = String(task.dedupe_key ?? "—");
  const json = JSON.stringify(task, null, 2);
  const jsonClipped = clipPrompt(json.replace(/\s+/g, " "), Math.max(40, width * 3));

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      paddingY={1}
      marginBottom={1}
      width={width}
    >
      <Text bold color="yellow">
        任务详情（ESC / q 关闭）
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>task_id</Text>
        <Text>{clipPrompt(id, width - 4)}</Text>
        <Text dimColor>status · mode</Text>
        <Text>
          {st} · {mode}
        </Text>
        <Text dimColor>dedupe_key</Text>
        <Text>{clipPrompt(dedupe, width - 4)}</Text>
        <Text dimColor>prompt</Text>
        <Text wrap="wrap">{pr || "—"}</Text>
        <Box marginTop={1}>
          <Text dimColor>JSON</Text>
        </Box>
        <Text dimColor wrap="wrap">
          {jsonClipped}
        </Text>
      </Box>
    </Box>
  );
}
