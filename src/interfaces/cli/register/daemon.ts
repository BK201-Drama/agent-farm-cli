import type { Command } from "commander";
import {
  startDaemon,
  stopDaemon,
  getDaemonStatus,
} from "../../../application/facades/daemon.js";
import { createCliQueueContainer } from "../default-queue-container.js";
import { print } from "../print.js";

export function registerDaemonCommands(program: Command): void {
  const daemon = program
    .command("daemon")
    .description("后台 daemon 管理（start/stop/status）");

  daemon
    .command("start")
    .description("启动 daemon 后台进程，自动消费队列任务")
    .option("--workers <n>", "并发 worker 数", "2")
    .option("--workspace <path>", "工作区路径", process.cwd())
    .option("--loop-sleep-ms <n>", "轮询间隔（ms）", "500")
    .action(async (opts) => {
      const result = await startDaemon({
        workspace: String(opts.workspace),
        workers: Number(opts.workers),
        loopSleepMs: Number(opts.loopSleepMs),
      });
      print(result);
    });

  daemon
    .command("stop")
    .description("停止 daemon 进程")
    .option("--workspace <path>", "工作区路径", process.cwd())
    .action(async (opts) => {
      const result = await stopDaemon(String(opts.workspace));
      print(result);
    });

  daemon
    .command("status")
    .description("查看 daemon 运行状态和队列概况")
    .option("--workspace <path>", "工作区路径", process.cwd())
    .option("--brief", "一行摘要输出到 stderr", false)
    .action(async (opts) => {
      const workspace = String(opts.workspace);
      const container = await createCliQueueContainer();
      const result = await getDaemonStatus(
        workspace,
        container.statusService,
      );

      if (opts.brief) {
        const sc = result.queue?.statusCounts ?? {};
        const done = sc.done ?? 0;
        const failed = (sc.failed ?? 0) + (sc.blocked ?? 0);
        const total = result.queue?.total ?? 0;
        const uptime = result.uptimeMs
          ? `${Math.floor(result.uptimeMs / 60000)}m`
          : "?";
        process.stderr.write(
          `daemon: ${result.daemon} (${uptime}) | queue: ${total} total, ${done} done, ${failed} failed\n`,
        );
        return;
      }

      print(result);
    });
}
