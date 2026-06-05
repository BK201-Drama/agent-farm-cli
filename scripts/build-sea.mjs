#!/usr/bin/env node
/**
 * 用 Node.js SEA (Single Executable Application) 将 bundle 注入 node.exe。
 *
 * 前置条件: npm run build && npm run build:bundle
 * 支持平台: win32 (输出 agent-farm.exe)
 *
 * 用法: node scripts/build-sea.mjs
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const bundleDir = join(root, "bundle");
const bundleFile = join(bundleDir, "agent-farm.cjs");
const outExe = join(root, "agent-farm.exe");

const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";
const ext = isWindows ? ".exe" : isMac ? "" : "";

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8", ...opts });
  if (r.status !== 0 && r.status !== null) {
    console.error(`[sea] ${cmd} failed (exit ${r.status})`);
    process.exit(r.status);
  }
  return r;
}

if (!existsSync(bundleFile)) {
  console.error("[sea] bundle/agent-farm.cjs not found. Run 'npm run build:bundle' first.");
  process.exit(1);
}

// Create SEA config
const seaConfig = {
  main: bundleFile,
  output: join(bundleDir, "sea-prep.blob"),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
};
const configPath = join(bundleDir, "sea-config.json");
writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));
console.log(`[sea] wrote sea-config.json`);

// Step 1: Generate blob
const nodeExe = process.execPath;
run(nodeExe, ["--experimental-sea-config", configPath]);

// Step 2: Copy node.exe and inject blob
if (isWindows) {
  const tempExe = join(bundleDir, "agent-farm-tmp.exe");
  copyFileSync(nodeExe, tempExe);

  // Try postject; if not available, use a simple copy + note
  try {
    run("npx", ["--yes", "postject", tempExe, "NODE_SEA_BLOB", join(bundleDir, "sea-prep.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"]);
  } catch {
    console.warn("[sea] postject not available; copying node.exe directly (requires Node.js runtime)");
  }

  // Move to final location
  if (existsSync(outExe)) rmSync(outExe, { force: true });
  renameSync(tempExe, outExe);
  console.log(`[sea] created ${outExe}`);
} else if (isMac) {
  // macOS: codesign after postject
  const tempBin = join(bundleDir, "agent-farm-tmp");
  copyFileSync(nodeExe, tempBin);
  try {
    run("npx", ["--yes", "postject", tempBin, "NODE_SEA_BLOB", join(bundleDir, "sea-prep.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"]);
    run("codesign", ["--sign", "-", "--force", tempBin]);
  } catch {
    console.warn("[sea] postject/codesign failed; copying node binary directly");
  }
  renameSync(tempBin, join(root, "agent-farm"));
  console.log("[sea] created agent-farm");
} else {
  // Linux
  const tempBin = join(bundleDir, "agent-farm-tmp");
  copyFileSync(nodeExe, tempBin);
  try {
    run("npx", ["--yes", "postject", tempBin, "NODE_SEA_BLOB", join(bundleDir, "sea-prep.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"]);
  } catch {
    console.warn("[sea] postject not available; copying node binary directly");
  }
  renameSync(tempBin, join(root, "agent-farm"));
  console.log("[sea] created agent-farm");
}

console.log("[sea] done.");
