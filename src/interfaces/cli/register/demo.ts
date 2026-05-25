import type { Command } from "commander";
import { DEFAULT_TASK_FILE } from "../defaults.js";
import { print } from "../print.js";

const noopBody = () => ({
  mode: "execute" as const,
  execute_command_template: "node -e \"console.log('agent-farm demo noop')\"",
  verify_command_template: 'node -e "process.exit(0)"',
  prompt:
    "Demo task (noop). Prefix demo- in dedupe_key. Cancel via queue update when done. See docs/integrations/github-actions-health.md.",
});

const checkBody = () => ({
  mode: "execute" as const,
  execute_command_template: "npm run check",
  verify_command_template: "npm run check",
  prompt: "Demo task: npm run check (execute + verify). Prefix demo-. See docs/integrations/github-actions-health.md.",
});

export function registerDemoCommands(program: Command): void {
  const demo = program
    .command("demo")
    .description("本地上手辅助：示例任务（dedupe_key 使用 demo- 前缀，便于识别与清理）");

  demo
    .command("task")
    .description("入队单条 demo 任务（模板 noop | check）")
    .option("--template <name>", "noop | check", "noop")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      const name = String(opts.template).toLowerCase();
      if (name !== "noop" && name !== "check") {
        throw new Error(`demo task: unknown template "${opts.template}", expected noop|check`);
      }
      const { createCliQueueContainer } = await import("../default-queue-container.js");
      const ts = Date.now();
      const taskId = `demo-onboarding-${ts}`;
      const dedupeKey = `demo-onboarding-${ts}`;
      const body = name === "check" ? checkBody() : noopBody();
      const task = {
        task_id: taskId,
        dedupe_key: dedupeKey,
        priority: 0,
        ...body,
      };
      const container = await createCliQueueContainer({ taskFile: String(opts.taskFile) });
      const row = await container.queueService.addTask(task as Record<string, unknown>);
      print({
        ok: true,
        message:
          "Demo task enqueued. Try: agent-farm dashboard. Later: agent-farm queue update --task-id … --status cancelled",
        task: row,
      });
    });
}
