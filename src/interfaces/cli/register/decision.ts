import type { Command } from "commander";
import { DEFAULT_TASK_FILE } from "../defaults.js";
import { print } from "../print.js";
import { createCliQueueContainer } from "../default-queue-container.js";

export function registerDecisionCommands(program: Command): void {
  const decision = program.command("decision").description("决策仲裁：管理升级待决项");

  decision
    .command("list")
    .description("列出所有待人工裁决的升级决策")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--task <id>", "按 task ID 过滤")
    .action(async (opts) => {
      const container = await createCliQueueContainer({
        taskFile: String(opts.taskFile),
      });
      const decisions = await container.decisionService.listEscalations(
        opts.task ? String(opts.task) : undefined,
      );
      print(decisions);
    });

  decision
    .command("resolve")
    .description("解决升级决策，可选重置关联 task")
    .argument("<escalation-id>", "升级 ID")
    .requiredOption("--choice <opt>", "选择的方案")
    .requiredOption("--reason <text>", "选择理由")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--no-retry", "不重置关联 task（仅记录决策）")
    .action(async (escalationId, opts) => {
      const container = await createCliQueueContainer({
        taskFile: String(opts.taskFile),
      });
      const result = await container.decisionService.resolveEscalation(
        String(escalationId),
        String(opts.choice),
        String(opts.reason),
        opts.retry !== false, // --no-retry sets opts.retry = false
      );
      print(result);
    });
}
