import * as path from "node:path";
import type { Command } from "commander";
import { acceptanceTaskKeyPrefix } from "../../../application/acceptance/acceptance-task-key.js";
import { loadAcceptanceSpec } from "../../../application/acceptance/load-acceptance.js";
import { getAcceptanceStatus } from "../../../application/acceptance/status.js";
import { runDemo, DemoBlockedError } from "../../../application/acceptance/run-demo.js";
import { acceptanceProgressPath, readProgress, writeProgress } from "../../../application/acceptance/progress-store.js";
import { defaultShellRunner } from "../../../infrastructure/process/shell.js";
import { print } from "../print.js";
import { queueCliContainer } from "./queue/container.js";
import { DEFAULT_TASK_FILE } from "../defaults.js";

function fail(payload: Record<string, unknown>): never {
  print({ ok: false, ...payload });
  process.exit(1);
}

async function collectAcceptanceTaskStatuses(
  taskFile: string,
  pocId: string,
): Promise<{ container: Awaited<ReturnType<typeof queueCliContainer>>; taskStatuses: Map<string, string>; dedupeKeys: Set<string> }> {
  const container = await queueCliContainer({ taskFile });
  const allTasks = await container.queueService.listTasks();
  const taskStatuses = new Map<string, string>();
  const dedupeKeys = new Set<string>();
  const prefix = acceptanceTaskKeyPrefix(pocId);

  for (const task of allTasks) {
    const dk = task.dedupe_key;
    if (!dk) continue;
    const key = String(dk);
    dedupeKeys.add(key);
    if (key.startsWith(prefix)) {
      taskStatuses.set(key, String(task.status ?? "queued"));
    }
  }

  return { container, taskStatuses, dedupeKeys };
}

export function registerAcceptanceCommands(program: Command): void {
  const acceptance = program
    .command("acceptance")
    .description("Spec Acceptance Runtime：验收规格加载、状态查询、demo 执行");

  acceptance
    .command("load")
    .description("加载验收规格 JSON 并初始化进度 + 入队验收任务")
    .requiredOption("--spec <path>", "验收规格 JSON 文件路径")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      try {
        const specFilePath = path.resolve(String(opts.spec));
        const farmRoot = process.cwd();
        // 预读队列以支持幂等：需先 parse poc_id，故用临时读文件
        const raw = await import("node:fs/promises").then((fs) => fs.readFile(specFilePath, "utf-8"));
        const pocId = String((JSON.parse(raw) as { poc_id?: string }).poc_id ?? "");
        const { container, dedupeKeys } = await collectAcceptanceTaskStatuses(String(opts.taskFile), pocId || "_");

        const result = await loadAcceptanceSpec({
          specFilePath,
          farmRoot,
          enqueue: (task) => container.queueService.addTask(task),
          existingDedupeKeys: dedupeKeys,
        });

        print({
          ok: true,
          poc_id: result.spec.poc_id,
          enqueued_count: result.enqueuedCount,
          skipped_existing_count: result.skippedExistingCount,
          total_items: result.spec.items.length,
        });
      } catch (e) {
        fail({ error: e instanceof Error ? e.message : String(e) });
      }
    });

  acceptance
    .command("status")
    .description("查询验收状态（reconcile 队列最新进度后判定 done）")
    .requiredOption("--poc <id>", "POC ID")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .action(async (opts) => {
      try {
        const pocId = String(opts.poc);
        const farmRoot = process.cwd();
        const progressPath = acceptanceProgressPath(farmRoot, pocId);
        const progress = await readProgress(progressPath);

        if (!progress) {
          fail({ error: `No progress file found for POC "${pocId}" at ${progressPath}` });
        }

        const { taskStatuses } = await collectAcceptanceTaskStatuses(String(opts.taskFile), pocId);
        const status = getAcceptanceStatus({ progress, taskStatuses });
        await writeProgress(progressPath, status.progress);

        print({
          ok: true,
          poc_id: pocId,
          done: status.done,
          demo: status.progress.demo,
          items: status.progress.items,
          updated_at: status.progress.updated_at,
        });
      } catch (e) {
        fail({ error: e instanceof Error ? e.message : String(e) });
      }
    });

  acceptance
    .command("demo")
    .description("执行 demo 验收（要求所有 item 均已 pass）")
    .requiredOption("--poc <id>", "POC ID")
    .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
    .option("--timeout-ms <ms>", "命令超时（毫秒）", "120000")
    .action(async (opts) => {
      try {
        const pocId = String(opts.poc);
        const farmRoot = process.cwd();
        const progressPath = acceptanceProgressPath(farmRoot, pocId);
        const progress = await readProgress(progressPath);

        if (!progress) {
          fail({ error: `No progress file found for POC "${pocId}" at ${progressPath}` });
        }

        const { taskStatuses } = await collectAcceptanceTaskStatuses(String(opts.taskFile), pocId);
        const result = await runDemo({
          progress,
          taskStatuses,
          farmRoot,
          runShell: defaultShellRunner,
          timeoutMs: Number(opts.timeoutMs),
        });

        await writeProgress(progressPath, result.progress);

        print({
          ok: true,
          poc_id: pocId,
          passed: result.passed,
          output: result.output,
          demo: result.progress.demo,
          updated_at: result.progress.updated_at,
        });
      } catch (e) {
        if (e instanceof DemoBlockedError) {
          fail({ error: e.message, failing_item_ids: e.failingItemIds });
        }
        fail({ error: e instanceof Error ? e.message : String(e) });
      }
    });
}
