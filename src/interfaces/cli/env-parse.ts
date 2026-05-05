import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TASK_STATUSES, type TaskStatus } from "../../domain/task.js";

export const DEV_ENVIRONMENTS = ["cursor", "claude", "codex"] as const;
export type DevEnvironment = (typeof DEV_ENVIRONMENTS)[number];

export function parseEnvironmentList(raw: string): DevEnvironment[] {
  const values = raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(values)];
  for (const item of unique) {
    if (!(DEV_ENVIRONMENTS as readonly string[]).includes(item)) {
      throw new Error(
        `invalid environment: ${item}. expected one of: ${DEV_ENVIRONMENTS.join(", ")}`
      );
    }
  }
  if (unique.length === 0) {
    throw new Error("no environments selected");
  }
  return unique as DevEnvironment[];
}

export async function selectEnvironmentsInteractively(): Promise<DevEnvironment[]> {
  const rl = createInterface({ input, output });
  output.write(
    `Select development environments (comma-separated numbers):\n` +
      `  1) cursor\n` +
      `  2) claude\n` +
      `  3) codex\n` +
      `Example: 1,2\n`
  );
  const answer = (await rl.question("Your choice [1]: ")).trim();
  rl.close();
  const choice = answer || "1";
  const mapping: Record<string, DevEnvironment> = {
    "1": "cursor",
    "2": "claude",
    "3": "codex",
  };
  const envs = choice
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((idx) => mapping[idx]);
  if (envs.some((x) => !x)) {
    throw new Error("invalid environment selection. use numbers 1,2,3");
  }
  return [...new Set(envs)] as DevEnvironment[];
}

export function parseStatus(raw: string): TaskStatus {
  if ((TASK_STATUSES as readonly string[]).includes(raw)) {
    return raw as TaskStatus;
  }
  throw new Error(`invalid status: ${raw}`);
}
