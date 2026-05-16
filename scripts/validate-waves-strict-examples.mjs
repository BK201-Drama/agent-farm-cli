#!/usr/bin/env node
/** 仅对 examples/waves 做严格 prompt lint（CI 用）。 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.AGENT_FARM_PROMPT_LINT_STRICT = "1";
const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(
  process.execPath,
  [join(here, "validate-waves.mjs"), join(here, "..", "examples", "waves")],
  { stdio: "inherit", env: process.env },
);
process.exit(r.status ?? 1);
