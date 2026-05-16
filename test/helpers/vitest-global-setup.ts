import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function setup(): void {
  const root = join(fileURLToPath(new URL("../..", import.meta.url)));
  const r = spawnSync(process.execPath, [join(root, "scripts/ensure-built.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error("vitest globalSetup: ensure-built failed");
  }
}
