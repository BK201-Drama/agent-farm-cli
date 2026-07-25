/**
 * Decision Arbitration Layer 端到端演示
 * 用法: npx tsx scripts/demo-decision.ts
 */
import { createContainer, type StoragePaths } from "../src/bootstrap/container.js";
import { resolve } from "node:path";

const cwd = process.cwd();

const paths: StoragePaths = {
  storage: "sqlite",
  dbFile: resolve(cwd, ".agent-farm/queue/agent_farm.db"),
  taskFile: resolve(cwd, ".agent-farm/queue/tasks.jsonl"),
  eventFile: resolve(cwd, ".agent-farm/queue/events.jsonl"),
  quarantineFile: resolve(cwd, ".agent-farm/queue/quarantine_tasks.jsonl"),
};

const { decisionService, decisionEngine } = createContainer(paths);

console.log("═══════════════════════════════════════════");
console.log("  Decision Arbitration Layer — 演示");
console.log("═══════════════════════════════════════════\n");

// 当前加载的规则
console.log("📋 已加载规则:");
for (const rule of decisionEngine.getRules()) {
  console.log(`   [${rule.id}] ${rule.description}`);
  console.log(`      patterns: ${rule.context_patterns.join(", ")}`);
  console.log(`      → ${rule.preferred_option ?? rule.default_choice ?? "auto"}`);
}
console.log();

// ── 场景 1: 规则命中，自动裁决 ──
console.log("── 场景 1: Worker 遇到存储选择 ──");
console.log('   Context: "需要持久化浏览器注解数据，选择存储方案"');
console.log('   Options: ["IndexedDB", "SQLite", "localStorage"]\n');

const r1 = await decisionService.requestDecision({
  task_id: "demo-task-1",
  decision_id: "d_001",
  context: "需要持久化浏览器注解数据，选择存储方案",
  options: ["IndexedDB", "SQLite", "localStorage"],
  recommendation: "IndexedDB",
  stage: "execute",
  attempt: 1,
});

console.log(`   ✅ 自动裁决: ${(r1 as { chosen: string }).chosen}`);
console.log(`   📝 理由: ${r1.reason}`);
console.log(`   🎯 置信度: ${(r1 as { confidence: number }).confidence}`);
console.log(`   🤖 方式: ${(r1 as { resolved_by: string }).resolved_by}`);
console.log(`   🚨 升级: ${r1.escalated ? "是" : "否"}\n`);

// ── 场景 2: 无规则命中，升级 ──
console.log("── 场景 2: Worker 遇到规则库之外的选择 ──");
console.log('   Context: "What color palette should we use for the dashboard UI?"');
console.log('   Options: ["Blue/Gray", "Green/White", "Dark Mode"]\n');

const r2 = await decisionService.requestDecision({
  task_id: "demo-task-2",
  decision_id: "d_002",
  context: "What color palette should we use for the dashboard UI?",
  options: ["Blue/Gray", "Green/White", "Dark Mode"],
  recommendation: "Blue/Gray",
  stage: "execute",
  attempt: 1,
});

console.log(`   🚨 升级: ${r2.escalated ? "是" : "否"}`);
if (r2.escalated) {
  console.log(`   🆔 Escalation ID: ${r2.escalation_id}`);
}
console.log(`   📝 理由: ${r2.reason}\n`);

// ── 场景 3: 查看升级列表 ──
console.log("── 场景 3: 查看待裁决列表 ──");
const escalated = await decisionService.listEscalations();
console.log(`   待裁决: ${escalated.length} 条\n`);
for (const d of escalated) {
  console.log(`   [${d.id}] task=${d.task_id}`);
  console.log(`   Context: ${d.context}`);
  console.log(`   Options: ${d.options.join(" / ")}`);
  console.log(`   Worker 推荐: ${d.reason.split("\n")[0]}\n`);
}

// ── 场景 4: 人工裁决 ──
if (r2.escalated) {
  console.log("── 场景 4: 人工裁决升级 ──");
  console.log(`   Resolving ${r2.escalation_id} → "Dark Mode"\n`);

  const resolved = await decisionService.resolveEscalation(
    r2.escalation_id,
    "Dark Mode",
    "dashboard 在暗光环境下使用频繁，暗色模式更护眼",
    false, // 不重置 task（demo 里没有真实 task）
  );

  console.log(`   ✅ 已裁决: ${(resolved as Record<string, unknown>).chosen}`);
  console.log(`   📋 决策记录:`, JSON.stringify((resolved as Record<string, unknown>).decision, null, 2));
}

// ── 场景 5: 规则匹配历史 ──
console.log("\n── 场景 5: 类似场景走历史匹配 ──");
console.log('   Context: "Need database solution for persisting application storage"');
console.log('   Options: ["SQLite", "PostgreSQL", "MongoDB"]\n');

const r3 = await decisionService.requestDecision({
  task_id: "demo-task-3",
  decision_id: "d_003",
  context: "Need database solution for persisting application storage",
  options: ["SQLite", "PostgreSQL", "MongoDB"],
  stage: "execute",
  attempt: 1,
});

console.log(`   ✅ 裁决: ${(r3 as { chosen: string }).chosen}`);
console.log(`   📝 理由: ${r3.reason}`);
console.log(`   🤖 方式: ${(r3 as { resolved_by: string }).resolved_by}\n`);

console.log("═══════════════════════════════════════════");
console.log("  演示结束");
console.log("═══════════════════════════════════════════");
