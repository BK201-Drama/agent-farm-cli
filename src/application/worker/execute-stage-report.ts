import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ExecuteStageReport = {
  schema_version: 1;
  task_id: string;
  attempt: number;
  stage: "execute";
  finished_at: string;
  exit_code: number;
  output_bytes: number;
  output_preview: string;
};

const PREVIEW_CAP = 2000;

export function writeExecuteStageReport(
  runsDir: string,
  taskId: string,
  attempt: number,
  finishedAtIso: string,
  exitCode: number,
  output: string,
): string {
  const dir = join(runsDir, taskId);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `execute-${attempt}.json`);
  const body: ExecuteStageReport = {
    schema_version: 1,
    task_id: taskId,
    attempt,
    stage: "execute",
    finished_at: finishedAtIso,
    exit_code: exitCode,
    output_bytes: Buffer.byteLength(output, "utf8"),
    output_preview: output.slice(0, PREVIEW_CAP),
  };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return file;
}
