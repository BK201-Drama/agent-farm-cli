#!/usr/bin/env node
/**
 * M3：15 分钟 onboarding 自动检查（陌生人路径冒烟）。
 * 在仓库根运行：npm run farm:onboarding:15min
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runOnboardingChecks } from "./lib/onboarding-15min-check-lib.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

console.log("agent-farm onboarding 15min check\n");

const { steps, failed, ok } = runOnboardingChecks({ root });

for (const s of steps) {
  if (s.skipped) {
    console.log(`· 跳过 ${s.label}`);
    continue;
  }
  if (s.ok) console.log(`✓ ${s.label}`);
  else console.error(`✗ ${s.label}`);
}

console.log("");
if (!ok) {
  console.error(`onboarding-15min-check: ${failed} step(s) failed`);
  process.exit(1);
}
console.log("onboarding-15min-check: OK");
console.log("人工步骤：docs/user-guide/zh/onboarding-15min.md（侧栏 / MCP / worker）");
