import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readPidFile,
  writePidFile,
  deletePidFile,
} from "../../infrastructure/daemon/pid-file.js";
import {
  writeDaemonState,
  readDaemonState,
  deleteDaemonState,
  daemonStatePath,
  daemonPidPath,
  type DaemonState,
} from "../../infrastructure/daemon/daemon-state.js";
import type { StatusService } from "./status.js";

export type DaemonStartOptions = {
  workspace: string;
  workers: number;
  loopSleepMs: number;
};

export async function startDaemon(
  opts: DaemonStartOptions,
): Promise<{ ok: boolean; pid?: number; error?: string }> {
  const pidPath = daemonPidPath(opts.workspace);
  const statePath = daemonStatePath(opts.workspace);

  const existingPid = readPidFile(pidPath);
  if (existingPid !== null) {
    return {
      ok: false,
      error: `daemon already running (PID ${existingPid})`,
    };
  }
  // Clean up stale state
  deletePidFile(pidPath);
  deleteDaemonState(statePath);

  // Spawn the daemon runner as a detached child process
  const runnerPath = fileURLToPath(
    new URL(
      "../../infrastructure/daemon/daemon-runner.js",
      import.meta.url,
    ),
  );
  const child = spawn(process.execPath, [runnerPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      AGENT_FARM_DAEMON_WORKSPACE: opts.workspace,
      AGENT_FARM_DAEMON_WORKERS: String(opts.workers),
      AGENT_FARM_DAEMON_LOOP_SLEEP_MS: String(opts.loopSleepMs),
    },
  });

  const pid = child.pid ?? 0;
  writePidFile(pidPath, pid);

  const state: DaemonState = {
    startedAt: new Date().toISOString(),
    workers: opts.workers,
    status: "running",
    lastHeartbeat: new Date().toISOString(),
  };
  writeDaemonState(statePath, state);

  child.unref();
  child.on("error", () => {
    deletePidFile(pidPath);
    deleteDaemonState(statePath);
  });

  return { ok: true, pid };
}

export async function stopDaemon(
  workspace: string,
): Promise<{ ok: boolean; error?: string }> {
  const pidPath = daemonPidPath(workspace);
  const statePath = daemonStatePath(workspace);

  const pid = readPidFile(pidPath);
  if (pid === null) {
    deletePidFile(pidPath);
    deleteDaemonState(statePath);
    return { ok: false, error: "no daemon running" };
  }

  // Graceful shutdown: SIGTERM → wait 5s → SIGKILL
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process already gone
    deletePidFile(pidPath);
    deleteDaemonState(statePath);
    return { ok: true };
  }

  const deadline = Date.now() + 5000;
  let alive = true;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (alive) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }

  deletePidFile(pidPath);
  deleteDaemonState(statePath);
  return { ok: true };
}

export type DaemonStatusResult = {
  daemon: "running" | "stopped" | "crashed";
  pid?: number;
  startedAt?: string;
  workers?: number;
  uptimeMs?: number;
  lastHeartbeat?: string;
  queue?: {
    total: number;
    statusCounts: Record<string, number>;
  };
};

export async function getDaemonStatus(
  workspace: string,
  statusService: StatusService,
): Promise<DaemonStatusResult> {
  const pidPath = daemonPidPath(workspace);
  const statePath = daemonStatePath(workspace);

  const pid = readPidFile(pidPath);
  const state = readDaemonState(statePath);

  if (pid === null) {
    if (state !== null) {
      return { daemon: "crashed", startedAt: state.startedAt };
    }
    return { daemon: "stopped" };
  }

  const queue = await statusService.build(5);

  return {
    daemon: "running",
    pid,
    startedAt: state?.startedAt,
    workers: state?.workers,
    uptimeMs: state?.startedAt
      ? Date.now() - new Date(state.startedAt).getTime()
      : undefined,
    lastHeartbeat: state?.lastHeartbeat,
    queue: {
      total: Number(queue.tasks_total ?? 0),
      statusCounts: (queue.status_counts as Record<string, number>) ?? {},
    },
  };
}
