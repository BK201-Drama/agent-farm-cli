# Daemon Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `agent-farm daemon start/stop/status` — a CLI-only background daemon that wraps the existing worker pool loop, with Windows toast notifications for task events.

**Architecture:** Five new files + one registry update. The daemon uses `child_process.fork()` to run a thin runner module in a detached child process. The runner imports `runWorkerLoop` directly with `drainIdleLoops=0`. PID/state files in `.agent-farm/` manage lifecycle. Notifications use PowerShell toast via `spawn`.

**Tech Stack:** TypeScript strict ESM (NodeNext), Node.js `child_process.fork/spawn`, PowerShell for Windows toasts, Commander.js CLI, existing `runWorkerLoop`/`StatusService`.

## Global Constraints

- Windows only — no cross-platform notification abstraction
- No registry writes — PID files live in `.agent-farm/`
- No third-party GUI/tray dependencies
- Daemon crash must not affect SQLite queue (guaranteed by existing persistence)
- Reuse `runWorkerLoop` — do not reimplement task consumption
- Do not change existing domain model or queue service
- Follow existing codebase patterns: ESM, `.js` import extensions, Commander subcommands, facades

---

### Task 1: PID File Management

**Files:**
- Create: `src/infrastructure/daemon/pid-file.ts`

**Interfaces:**
- Produces: `writePidFile(filePath: string, pid: number): void` — writes PID to file, overwrites
- Produces: `readPidFile(filePath: string): number | null` — reads PID, returns null if missing or process dead
- Produces: `deletePidFile(filePath: string): void` — removes file, no-op if missing

- [ ] **Step 1: Write the PID file module**

```typescript
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

export function writePidFile(filePath: string, pid: number): void {
  writeFileSync(filePath, String(pid), "utf8");
}

export function readPidFile(filePath: string): number | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    // Check if process is alive
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return null; // process dead
    }
  } catch {
    return null;
  }
}

export function deletePidFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // already gone — no-op
  }
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors on this file

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/daemon/pid-file.ts
git commit -m "feat(daemon): add PID file management"
```

---

### Task 2: Daemon State File & Path Helpers

**Files:**
- Create: `src/infrastructure/daemon/daemon-state.ts`

**Interfaces:**
- Produces: `DaemonState` type — `{ startedAt: string; workers: number; status: "running"; lastHeartbeat: string }`
- Produces: `writeDaemonState(filePath: string, state: DaemonState): void`
- Produces: `readDaemonState(filePath: string): DaemonState | null`
- Produces: `deleteDaemonState(filePath: string): void`
- Produces: `daemonStatePath(workspace: string): string` — returns `join(workspace, ".agent-farm", "daemon-state.json")`
- Produces: `daemonPidPath(workspace: string): string` — returns `join(workspace, ".agent-farm", "daemon.pid")`

- [ ] **Step 1: Write the module**

```typescript
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

export type DaemonState = {
  startedAt: string;     // ISO 8601
  workers: number;
  status: "running";
  lastHeartbeat: string; // ISO 8601, updated periodically
};

export function writeDaemonState(filePath: string, state: DaemonState): void {
  writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

export function readDaemonState(filePath: string): DaemonState | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as DaemonState;
    if (!parsed.startedAt || !parsed.status) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteDaemonState(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // already gone
  }
}

export function daemonStatePath(workspace: string): string {
  return join(workspace, ".agent-farm", "daemon-state.json");
}

export function daemonPidPath(workspace: string): string {
  return join(workspace, ".agent-farm", "daemon.pid");
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/daemon/daemon-state.ts
git commit -m "feat(daemon): add daemon state file management"
```

---

### Task 3: Windows Toast Notification

**Files:**
- Create: `src/infrastructure/daemon/windows-notify.ts`

**Interfaces:**
- Produces: `sendWindowsToast(title: string, body: string): Promise<void>` — fires PowerShell toast, silent no-op on non-Windows or failure
- Produces: `NotifyEvent` type — `{ type: "done" | "failed" | "stuck" | "idle"; taskId: string; detail?: string }`
- Produces: `createNotifyThrottle(windowMs?: number): (event: NotifyEvent) => Promise<void>` — deduplicates same taskId+type within windowMs

- [ ] **Step 1: Write `sendWindowsToast`**

```typescript
import { spawn } from "node:child_process";

export async function sendWindowsToast(title: string, body: string): Promise<void> {
  if (process.platform !== "win32") return;

  const escapedTitle = title.replace(/'/g, "''");
  const escapedBody = body.replace(/'/g, "''");

  const psScript = [
    `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]`,
    `$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]`,
    `$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)`,
    `$textNodes = $template.GetElementsByTagName('text')`,
    `$textNodes.Item(0).AppendChild($template.CreateTextNode('${escapedTitle}'))`,
    `$textNodes.Item(1).AppendChild($template.CreateTextNode('${escapedBody}'))`,
    `$toast = [Windows.UI.Notifications.ToastNotification]::new($template)`,
    `$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('agent-farm-cli')`,
    `$notifier.Show($toast)`,
  ].join("; ");

  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}
```

- [ ] **Step 2: Write `NotifyEvent` type and `createNotifyThrottle`**

```typescript
export type NotifyEvent = {
  type: "done" | "failed" | "stuck" | "idle";
  taskId: string;
  detail?: string;
};

export function createNotifyThrottle(windowMs: number = 5 * 60 * 1000) {
  const recent = new Map<string, number>(); // key = "taskId::type", value = timestamp

  const throttledNotify = async (event: NotifyEvent): Promise<void> => {
    const key = `${event.taskId}::${event.type}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < windowMs) return;
    recent.set(key, now);

    // Prevent unbounded growth
    if (recent.size > 200) {
      const cutoff = now - windowMs;
      for (const [k, ts] of recent) {
        if (ts < cutoff) recent.delete(k);
      }
    }

    const titleMap: Record<NotifyEvent["type"], string> = {
      done: "Task Done",
      failed: "Task Failed",
      stuck: "Task Stuck",
      idle: "Daemon Idle",
    };

    const title = titleMap[event.type];
    const body = event.detail
      ? `${event.taskId.slice(0, 8)}... — ${event.detail.slice(0, 80)}`
      : `${event.taskId.slice(0, 8)}...`;

    await sendWindowsToast(title, body);
  };

  return throttledNotify;
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/daemon/windows-notify.ts
git commit -m "feat(daemon): add Windows toast notification via PowerShell"
```

---

### Task 4: Daemon Runner (Child Process Entry)

**Files:**
- Create: `src/infrastructure/daemon/daemon-runner.ts`

**Interfaces:**
- Reads config from env vars: `AGENT_FARM_DAEMON_WORKSPACE`, `AGENT_FARM_DAEMON_WORKERS`, `AGENT_FARM_DAEMON_LOOP_SLEEP_MS`
- Consumes: `createDefaultStorageContainer` from bootstrap
- Consumes: `runWorkerLoop` from application/facades/worker
- Consumes: `runShellCommand` from infrastructure/process/shell
- Consumes: `systemIsoClock` from infrastructure/clock/iso-clock
- Consumes: `daemonStatePath`, `readDaemonState`, `writeDaemonState` from daemon-state
- Consumes: `createNotifyThrottle` from windows-notify

- [ ] **Step 1: Write `daemon-runner.ts`**

```typescript
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
const loopSleepMs = Math.max(100, Number(process.env.AGENT_FARM_DAEMON_LOOP_SLEEP_MS) || 500);

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
      await notify({ type: "failed", taskId, detail: String(event.last_error ?? "") });
    } else if (eventType === "task_stuck" || eventType === "task_blocked") {
      await notify({ type: "stuck", taskId, detail: String(event.blocked_reason ?? event.last_error ?? "") });
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
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors on daemon-runner.ts

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/daemon/daemon-runner.ts
git commit -m "feat(daemon): add daemon child process runner"
```

---

### Task 5: Daemon Facade (start/stop/status)

**Files:**
- Create: `src/application/facades/daemon.ts`

**Interfaces:**
- Consumes: `readPidFile`, `writePidFile`, `deletePidFile` from pid-file
- Consumes: `writeDaemonState`, `readDaemonState`, `deleteDaemonState`, `daemonStatePath`, `daemonPidPath`, `DaemonState` from daemon-state
- Consumes: `StatusService` from `./status.js`
- Consumes: `fork` from `node:child_process`, `fileURLToPath` from `node:url`
- Produces: `startDaemon(opts: DaemonStartOptions): Promise<{ ok: boolean; pid?: number; error?: string }>`
- Produces: `stopDaemon(workspace: string): Promise<{ ok: boolean; error?: string }>`
- Produces: `getDaemonStatus(workspace: string, statusService: StatusService): Promise<DaemonStatusResult>`

- [ ] **Step 1: Write `daemon.ts` facade**

```typescript
import { fork } from "node:child_process";
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
    return { ok: false, error: `daemon already running (PID ${existingPid})` };
  }
  // Clean up stale state
  deletePidFile(pidPath);
  deleteDaemonState(statePath);

  // Fork the daemon runner as a detached child process
  const runnerPath = fileURLToPath(
    new URL("../../infrastructure/daemon/daemon-runner.js", import.meta.url),
  );
  const child = fork(runnerPath, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      AGENT_FARM_DAEMON_WORKSPACE: opts.workspace,
      AGENT_FARM_DAEMON_WORKERS: String(opts.workers),
      AGENT_FARM_DAEMON_LOOP_SLEEP_MS: String(opts.loopSleepMs),
    },
  });

  const pid = child.pid ?? 0;
  if (pid > 0) {
    writePidFile(pidPath, pid);
  } else {
    writePidFile(pidPath, child.pid ?? 0);
  }

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

  return { ok: true, pid: pid || child.pid ?? 0 };
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
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors on daemon.ts

- [ ] **Step 3: Commit**

```bash
git add src/application/facades/daemon.ts
git commit -m "feat(daemon): add daemon facade with start/stop/status"
```

---

### Task 6: CLI Command Registration

**Files:**
- Create: `src/interfaces/cli/register/daemon.ts`
- Modify: `src/interfaces/cli/register/index.ts` — add import + registration call

**Interfaces:**
- Consumes: `startDaemon`, `stopDaemon`, `getDaemonStatus` from daemon facade
- Consumes: `createCliQueueContainer` from default-queue-container
- Consumes: `print` from print
- Produces: `registerDaemonCommands(program: Command): void`

- [ ] **Step 1: Write `registerDaemonCommands`**

```typescript
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
      const result = await getDaemonStatus(workspace, container.statusService);

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
```

- [ ] **Step 2: Update `src/interfaces/cli/register/index.ts`**

Add import:
```typescript
import { registerDaemonCommands } from "./daemon.js";
```

Add registration call (after `registerWorkerCommand`):
```typescript
registerDaemonCommands(program);
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/interfaces/cli/register/daemon.ts src/interfaces/cli/register/index.ts
git commit -m "feat(daemon): add daemon CLI commands (start/stop/status)"
```

---

### Task 7: Build & Smoke Test

**Files:**
- None (verification only)

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: clean build, no errors on new daemon files

- [ ] **Step 2: Verify daemon commands appear in help**

Run: `node dist/interfaces/cli/index.js daemon --help`
Expected: shows `start`, `stop`, `status` subcommands

- [ ] **Step 3: Smoke test daemon start/status/stop**

```bash
node dist/interfaces/cli/index.js daemon start --workers 1
node dist/interfaces/cli/index.js daemon status --brief
node dist/interfaces/cli/index.js daemon stop
```

Expected:
- `start`: `{ "ok": true, "pid": <number> }`
- `status --brief`: `daemon: running (<uptime>) | queue: ...`
- `stop`: `{ "ok": true }`

- [ ] **Step 4: Verify double-start is rejected**

```bash
node dist/interfaces/cli/index.js daemon start --workers 1
node dist/interfaces/cli/index.js daemon start --workers 1  # should fail
node dist/interfaces/cli/index.js daemon stop
```

Expected: second start returns `{ "ok": false, "error": "daemon already running (PID ...)" }`

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all existing tests still pass

- [ ] **Step 6: Commit (if any fixes)**

Only if smoke test revealed issues requiring code changes.
