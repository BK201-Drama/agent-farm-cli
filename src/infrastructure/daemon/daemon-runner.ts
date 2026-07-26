// Daemon child process entry point.
// Forked by daemon.ts startDaemon(). Reads config from env vars,
// runs the worker pool loop forever with heartbeats and notifications.

import { resolveQueueWorkspace } from "../../domain/task/queue-workspace-paths.js";
import { createDefaultStorageContainer } from "../../bootstrap/default-storage-container.js";
import { runWorkerLoop } from "../../application/facades/worker.js";
import { systemIsoClock } from "../clock/iso-clock.js";
import { runShellCommand } from "../process/shell.js";
import {
  writeDaemonState,
  readDaemonState,
  daemonStatePath,
} from "./daemon-state.js";
import { createNotifyThrottle } from "./windows-notify.js";

const workspace = process.env.AGENT_FARM_DAEMON_WORKSPACE ?? process.cwd();
const workers = Math.max(1, Number(process.env.AGENT_FARM_DAEMON_WORKERS) || 2);
const loopSleepMs = Math.max(
  100,
  Number(process.env.AGENT_FARM_DAEMON_LOOP_SLEEP_MS) || 500,
);

const notify = createNotifyThrottle(5 * 60 * 1000);

async function heartbeat(): Promise<void> {
  const sp = daemonStatePath(workspace);
  const current = readDaemonState(sp);
  if (current) {
    current.lastHeartbeat = new Date().toISOString();
    writeDaemonState(sp, current);
  }
}

// Heartbeat every 30 seconds
const heartbeatInterval = setInterval(() => {
  heartbeat().catch(() => {});
}, 30_000);

async function main(): Promise<void> {
  const w = resolveQueueWorkspace(workspace);
  const container = await createDefaultStorageContainer({
    taskFile: w.taskFile,
    eventFile: w.eventFile,
    quarantineFile: w.quarantineFile,
  });

  // Wire notifications into the event stream by wrapping eventRepo.append
  const originalAppend = container.eventRepo.append.bind(container.eventRepo);
  container.eventRepo.append = async (event: Record<string, unknown>) => {
    await originalAppend(event);
    const eventType = String(event.event ?? "");
    const taskId = String(event.task_id ?? "");
    if (eventType === "task_completed" || eventType === "task_done") {
      await notify({ type: "done", taskId });
    } else if (eventType === "task_failed") {
      await notify({
        type: "failed",
        taskId,
        detail: String(event.last_error ?? ""),
      });
    } else if (
      eventType === "task_stuck" ||
      eventType === "task_blocked"
    ) {
      await notify({
        type: "stuck",
        taskId,
        detail: String(event.blocked_reason ?? event.last_error ?? ""),
      });
    }
  };

  await runWorkerLoop({
    queueService: container.queueService,
    eventRepo: container.eventRepo,
    runsDir: w.runsDirDefault,
    workspaceDir: workspace,
    workers,
    loopSleepMs,
    commandTemplate: "echo {prompt}",
    leaseTimeoutSeconds: 1800,
    drainIdleLoops: 0, // NEVER drain
    poisonMaxAttempts: 3,
    autoApproveReview: true,
    runShell: runShellCommand,
    clock: systemIsoClock,
    ports: container.ports,
    executionMemoryRepo: container.executionMemoryRepo,
  });
}

main().catch((err) => {
  clearInterval(heartbeatInterval);
  console.error(
    "[agent-farm daemon] fatal:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
