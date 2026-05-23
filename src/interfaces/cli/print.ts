import { writeFile } from "node:fs/promises";
import type { TaskRecord } from "../../domain/task.js";

export type OutputFormat = "json" | "text" | "table";

export function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/** 路径非空时写入与 `print()` 一致的 pretty JSON + 末尾换行（`doctor` / `insights` / `status` 的 `--output-file`）。 */
export async function writePrettyJsonReportIfPath(outputPath: string | undefined, data: unknown): Promise<void> {
  const p = String(outputPath ?? "");
  if (!p) {
    return;
  }
  await writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function printText(label: string, data: unknown): void {
  process.stdout.write(`${label}: ${JSON.stringify(data, null, 2)}\n`);
}

const TRUNCATE_WIDTH = 60;

function truncatePrompt(prompt?: string): string {
  if (!prompt) return "-";
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= TRUNCATE_WIDTH) return singleLine;
  return singleLine.slice(0, TRUNCATE_WIDTH - 3) + "...";
}

export function formatTaskRow(task: TaskRecord): string {
  const id = task.task_id ?? "-";
  const status = task.status ?? "-";
  const mode = task.mode ?? "-";
  const dedupe = task.dedupe_key ?? "-";
  const prompt = truncatePrompt(task.prompt);
  return `${id}  ${status.padEnd(10)}  ${mode.padEnd(8)}  ${dedupe.padEnd(20)}  ${prompt}`;
}

export function printTaskTable(tasks: TaskRecord[]): void {
  process.stdout.write(
    `${"# ID".padEnd(20)}  ${"STATUS".padEnd(10)}  ${"MODE".padEnd(8)}  ${"DEDUPE_KEY".padEnd(20)}  PROMPT\n`,
  );
  process.stdout.write(
    `${"".padEnd(20, "-")}  ${"".padEnd(10, "-")}  ${"".padEnd(8, "-")}  ${"".padEnd(20, "-")}  ${"".padEnd(TRUNCATE_WIDTH, "-")}\n`,
  );
  for (const task of tasks) {
    process.stdout.write(`${formatTaskRow(task)}\n`);
  }
}

export function printTaskText(tasks: TaskRecord[]): void {
  for (const task of tasks) {
    process.stdout.write(`== Task ${task.task_id ?? "-"} ==\n`);
    process.stdout.write(`  status: ${task.status ?? "-"}\n`);
    process.stdout.write(`  mode: ${task.mode ?? "-"}\n`);
    process.stdout.write(`  dedupe_key: ${task.dedupe_key ?? "-"}\n`);
    process.stdout.write(`  prompt: ${truncatePrompt(task.prompt)}\n`);
    process.stdout.write("\n");
  }
}

export function printTask(format: OutputFormat, tasks: TaskRecord[]): void {
  if (format === "text") {
    printTaskText(tasks);
  } else if (format === "table") {
    printTaskTable(tasks);
  } else {
    print(tasks);
  }
}
