import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonMap } from "../../domain/task.js";
import type { StuckReport } from "./stuck-report.js";

export type ControlPlaneHealth = {
  service: "agent-farm-control-plane";
  version: string;
  queue_cwd: string;
  doctor_ok: boolean;
  worker_hint: "active" | "idle" | "stalled" | "none";
  worker_hint_detail: string;
  counts: {
    queued: number;
    running: number;
    stuck: number;
  };
};

let cachedVersion: string | undefined;

export function readControlPlanePackageVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    cachedVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}

export function buildControlPlaneHealth(
  queueCwd: string,
  doctor: JsonMap,
  status: JsonMap,
  stuck: StuckReport,
): ControlPlaneHealth {
  const counts = (status.status_counts ?? {}) as Record<string, number>;
  const queued = Number(counts.queued ?? 0) + Number(counts.retry ?? 0);
  const running = Number(counts.running ?? 0) + Number(counts.claimed ?? 0);
  const stuckN = stuck.items.length;
  const staleN = Number(doctor.stale_running_count ?? 0);
  const hbMissing = Number(doctor.heartbeat_missing_count ?? 0);

  let worker_hint: ControlPlaneHealth["worker_hint"] = "none";
  let worker_hint_detail = "无活跃队列压力";

  if (staleN > 0 || hbMissing > 0) {
    worker_hint = "stalled";
    worker_hint_detail = `疑似 worker 异常（stale ${staleN}，心跳丢失 ${hbMissing}）`;
  } else if (running > 0) {
    worker_hint = "active";
    worker_hint_detail = `${running} 条任务执行中`;
  } else if (queued > 0) {
    worker_hint = "idle";
    worker_hint_detail = `${queued} 条待执行，请启动 worker`;
  }

  return {
    service: "agent-farm-control-plane",
    version: readControlPlanePackageVersion(),
    queue_cwd: queueCwd,
    doctor_ok: doctor.ok !== false && stuck.ok !== false,
    worker_hint,
    worker_hint_detail,
    counts: { queued, running, stuck: stuckN },
  };
}
