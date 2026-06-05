/**
 * `agent-farm schedule` — cron 定时任务管理
 */
import type { Command } from "commander";
import { addSchedule, loadSchedules, removeSchedule } from "../../../application/schedule/schedule-store.js";
import { describeCron, nextCronMatch, parseCron } from "../../../application/schedule/cron-matcher.js";
import { runDueSchedules } from "../../../application/schedule/schedule-runner.js";
import type { ScheduleEntry } from "../../../application/schedule/schedule-store.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function registerScheduleCommands(program: Command): void {
  const schedule = program.command("schedule").description("cron 定时任务调度");

  schedule
    .command("list")
    .description("列出所有定时任务")
    .option("--cwd <path>", "工作目录", process.cwd())
    .action(async (opts) => {
      const entries = loadSchedules(opts.cwd);
      if (entries.length === 0) {
        console.log("(无定时任务)");
        console.log('\n添加: agent-farm schedule add "0 9 * * 1-5" --wave ./daily.json');
        return;
      }
      for (const e of entries) {
        const status = e.enabled ? "启用" : "禁用";
        const desc = describeCron(e.cron);
        console.log(`[${status}] ${e.id}`);
        console.log(`  cron:  ${e.cron} (${desc})`);
        console.log(`  wave:  ${e.wave}`);
        if (e.last_run) console.log(`  上次:  ${e.last_run}`);
        if (e.next_run) console.log(`  下次:  ${e.next_run}`);
        console.log();
      }
    });

  schedule
    .command("add <cron>")
    .description("添加定时任务（5 字段 cron：分 时 日 月 周）")
    .requiredOption("--wave <path>", "wave JSON 文件路径（相对 cwd）")
    .option("--id <id>", "任务 ID（默认自动生成）")
    .option("--cwd <path>", "工作目录", process.cwd())
    .option("--disabled", "创建后不启用")
    .action(async (cronExpr: string, opts) => {
      const expr = parseCron(cronExpr);
      const desc = describeCron(cronExpr);
      const id = opts.id || `sched-${Date.now()}`;
      const wave = opts.wave;
      const fullWave = join(opts.cwd, wave);
      if (!existsSync(fullWave)) {
        console.error(`✗ wave 文件不存在: ${fullWave}`);
        process.exitCode = 1;
        return;
      }
      const now = new Date();
      const nextRun = nextCronMatch(expr, now);
      const entry: ScheduleEntry = {
        id,
        cron: cronExpr,
        wave,
        enabled: !opts.disabled,
        last_run: null,
        next_run: nextRun ? nextRun.toISOString() : null,
      };
      addSchedule(opts.cwd, entry);
      console.log(`✓ 已添加定时任务: ${id}`);
      console.log(`  描述: ${desc}`);
      console.log(`  wave: ${wave}`);
      if (nextRun) console.log(`  下次运行: ${nextRun.toISOString()}`);
    });

  schedule
    .command("remove <id>")
    .description("删除定时任务")
    .option("--cwd <path>", "工作目录", process.cwd())
    .action(async (id: string, opts) => {
      const ok = removeSchedule(opts.cwd, id);
      if (ok) {
        console.log(`✓ 已删除: ${id}`);
      } else {
        console.error(`✗ 未找到: ${id}`);
        process.exitCode = 1;
      }
    });

  schedule
    .command("run")
    .description("立即检查并执行到期任务")
    .option("--cwd <path>", "工作目录", process.cwd())
    .action(async (opts) => {
      const results = runDueSchedules(opts.cwd);
      if (results.length === 0) {
        console.log("(无定时任务)");
        return;
      }
      let ranCount = 0;
      for (const r of results) {
        if (r.ran) {
          console.log(`✓ ${r.id} → 已派活 ${r.wave}`);
          ranCount++;
        } else if (r.error) {
          console.error(`✗ ${r.id}: ${r.error}`);
        }
      }
      if (ranCount === 0) {
        console.log("当前无到期任务");
      }
    });
}
