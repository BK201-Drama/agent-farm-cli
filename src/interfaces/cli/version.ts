import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

export function readCliPackageVersion(): string {
  if (cached !== undefined) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, "..", "..", "..", "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  cached = typeof pkg.version === "string" ? pkg.version : "0.0.0";
  return cached;
}
