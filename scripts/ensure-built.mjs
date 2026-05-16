#!/usr/bin/env node
/**
 * 若 dist 关键产物缺失则 npm run build；已存在则跳过（避免 clean-dist 与并行测试竞态）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const markers = [
  "dist/interfaces/cli/index.js",
  "dist/application/wave/wave-validate.js",
  "dist/application/public-api.js",
];

const missing = markers.filter((rel) => !existsSync(join(root, rel)));
if (missing.length === 0) {
  process.exit(0);
}

const r = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 1);
