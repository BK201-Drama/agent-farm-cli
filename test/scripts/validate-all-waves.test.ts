import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);

async function validateWaveArray(data: unknown, file: string): Promise<void> {
  const mod = await import("../../scripts/lib/wave-validate.mjs");
  mod.validateWaveArray(data, file);
}

function waveDirs(): string[] {
  const dirs = [join(root, "examples", "waves")];
  const local = join(root, ".agent-farm", "waves");
  if (existsSync(local)) dirs.push(local);
  return dirs;
}

describe("validate all repo waves (non-strict)", () => {
  for (const dir of waveDirs()) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    for (const file of files) {
      it(`${file} in ${dir.split(/[/\\]/).slice(-2).join("/")}`, async () => {
        const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
        await expect(validateWaveArray(data, file)).resolves.toBeUndefined();
      });
    }
  }
});
