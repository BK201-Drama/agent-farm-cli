import type { Command } from "commander";
import { DEFAULT_TASK_FILE } from "../../defaults.js";
import { print } from "../../print.js";
import { queueCliContainer } from "./container.js";

export function registerQueueAdd(queue: Command): void {
  queue
    .command("add")
    .option("--task-json <json>", "task as json (omit when using --prompt)")
    .option("--prompt <text>", "build execute task without hand-rolled json")
    .option("--task-id <id>", "with --prompt (default task-<timestamp>)")
    .option("--dedupe-key <key>", "with --prompt (default manual:<task-id>)")
    .option("--priority <n>", "with --prompt: higher claims first (default 0)", "0")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const container = queueCliContainer({ taskFile: String(opts.taskFile) });
      const taskJsonRaw =
        opts.taskJson !== undefined && opts.taskJson !== null ? String(opts.taskJson).trim() : "";
      let task: Record<string, unknown>;
      if (taskJsonRaw.length > 0) {
        task = JSON.parse(String(opts.taskJson)) as Record<string, unknown>;
      } else if (opts.prompt !== undefined) {
        const taskId = String(opts.taskId ?? `task-${Date.now()}`);
        const dedupe = String(opts.dedupeKey ?? `manual:${taskId}`);
        task = {
          task_id: taskId,
          mode: "execute",
          prompt: String(opts.prompt),
          dedupe_key: dedupe,
          priority: Number(opts.priority) || 0,
        };
      } else {
        throw new Error("queue add: pass --task-json <json> or --prompt <text>");
      }
      const { validateTaskJsonBeforeEnqueue } = await import(
        "../../../../application/wave/validate-task-json.js"
      );
      await validateTaskJsonBeforeEnqueue(
        task,
        taskJsonRaw.length > 0
          ? `queue add task_id=${String(task.task_id ?? "?")}`
          : `queue add --prompt task_id=${String(task.task_id ?? "?")}`,
      );
      const row = await container.queueService.addTask(task);
      print({ ok: true, task: row });
    });
}
