#!/usr/bin/env node
/**
 * 将 agent-farm-cli 打包为单文件 CJS bundle，用于 Node.js SEA。
 *
 * 用法: node scripts/bundle-cli.mjs
 * 输出: bundle/agent-farm.cjs
 */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "bundle");
const outFile = join(outDir, "agent-farm.cjs");

// Clean and recreate output directory
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const isWindows = process.platform === "win32";

try {
  await build({
    entryPoints: [join(root, "src", "interfaces", "cli", "index.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: outFile,
    // Native modules must remain external
    external: ["better-sqlite3"],
    // Inject banner to handle better-sqlite3 require at runtime
    banner: {
      js: `// agent-farm standalone bundle (generated ${new Date().toISOString()})`,
    },
    // Shake out unused code
    treeShaking: true,
    minify: false, // Keep readable for debugging
    sourcemap: false,
    metafile: false,
  });
  console.log(`[bundle] agent-farm.cjs written (${(await import("node:fs/promises")).stat(outFile).then(s => s.size)} bytes)`);
} catch (err) {
  console.error("[bundle] esbuild failed:", err.message);
  process.exit(1);
}

// Copy better-sqlite3 native bindings alongside the bundle
const sqlite3BuildDir = join(root, "node_modules", "better-sqlite3", "build");
if (existsSync(sqlite3BuildDir)) {
  const destDir = join(outDir, "build");
  mkdirSync(destDir, { recursive: true });
  const bindingFile = isWindows ? "better_sqlite3.node" : "better_sqlite3.node";
  const srcBinding = join(sqlite3BuildDir, "Release", bindingFile);
  if (existsSync(srcBinding)) {
    copyFileSync(srcBinding, join(destDir, bindingFile));
    console.log(`[bundle] copied ${bindingFile} to bundle/build/`);
  }
}

// Copy panel-core.js for the control plane
const panelCore = join(root, "dist", "interfaces", "control-plane", "panel-core.js");
if (existsSync(panelCore)) {
  const destPanel = join(outDir, "panel-core.js");
  copyFileSync(panelCore, destPanel);
  console.log("[bundle] copied panel-core.js");
}

console.log("[bundle] done. Output: bundle/agent-farm.cjs");
console.log("[bundle] Next: npm run build:sea");
