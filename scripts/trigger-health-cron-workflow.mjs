#!/usr/bin/env node
/**
 * 触发 GitHub Actions：Agent farm health (cron)（workflow_dispatch）
 * 需已安装并登录 gh：`gh auth login`
 */
import { spawnSync } from "node:child_process";

const repo = process.env.GITHUB_REPOSITORY || "BK201-Drama/agent-farm-cli";
const workflow = "agent-farm-health-cron.yml";
const ref = process.env.GITHUB_REF_NAME || "main";

const r = spawnSync("gh", ["workflow", "run", workflow, "--repo", repo, "--ref", ref], {
  stdio: "inherit",
  encoding: "utf8",
});

if (r.status !== 0) {
  console.error(
    "\n触发失败。请先执行：gh auth login\n" +
      `或浏览器打开：https://github.com/${repo}/actions/workflows/${workflow} → Run workflow\n`,
  );
  process.exit(r.status ?? 1);
}

console.log("\n已触发 workflow。查看运行：");
console.log(`https://github.com/${repo}/actions/workflows/${workflow}`);

spawnSync("gh", ["run", "list", "--workflow", workflow, "--repo", repo, "--limit", "3"], {
  stdio: "inherit",
});
