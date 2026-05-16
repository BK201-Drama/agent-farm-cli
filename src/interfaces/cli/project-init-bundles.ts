import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateConsumerHealthWorkflowYaml } from "../../infrastructure/templates/consumer-health-workflow.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function readDefaultExampleWaveUtf8(): string | undefined {
  const p = join(packageRoot, "examples", "waves", "team-handoff-min.json");
  try {
    return readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
}

export function readDefaultHealthWorkflowUtf8(): string {
  return generateConsumerHealthWorkflowYaml();
}
