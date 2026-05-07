import type { JsonMap, TaskRecord } from "../../../../domain/task.js";
import {
  buildOpencodeFeed,
  type OpencodeFeedRow,
} from "../../../../infrastructure/opencode/opencode-feed.js";
import { partitionSortedTasks } from "./helpers/index.js";

export type RunPlainDashboardOpts = {
  listTasks: () => Promise<TaskRecord[]>;
  refreshMs: number;
  storageContext?: JsonMap;
  /** 与 Ink 看板一致：可选附带 OpenCode 摘要（按 opencodeRefreshMs 节流，避免每行队列轮询都打 export） */
  workspaceRoot?: string;
  opencodeFeed?: boolean;
  opencodeRefreshMs?: number;
  opencodeMaxSessions?: number;
  opencodeRowsPerSession?: number;
};

function summarize(tasks: TaskRecord[]): Record<string, unknown> {
  const { pipeline, history } = partitionSortedTasks(tasks);
  return {
    tasks: tasks.length,
    pipeline: pipeline.length,
    history: history.length,
    sample: tasks.slice(0, 5).map((t) => ({
      task_id: t.task_id,
      status: t.status,
    })),
  };
}

/** 非 TTY / 脚本用：每行一条 JSON，便于 watch / CI */
export function runPlainDashboard(opts: RunPlainDashboardOpts): Promise<void> {
  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let lastOpencodePollAt = 0;
    let opencodeFeedRows: OpencodeFeedRow[] = [];
    let opencodeFeedError: string | null = null;

    const tick = async (): Promise<void> => {
      try {
        const tasks = await opts.listTasks();
        let opencode_feed: OpencodeFeedRow[] | undefined;
        let opencode_feed_error: string | null | undefined;
        if (opts.opencodeFeed === true && opts.workspaceRoot) {
          const interval = Math.max(800, opts.opencodeRefreshMs ?? 2500);
          const now = Date.now();
          if (lastOpencodePollAt === 0 || now - lastOpencodePollAt >= interval) {
            lastOpencodePollAt = now;
            try {
              opencodeFeedRows = await buildOpencodeFeed({
                workspaceRoot: opts.workspaceRoot,
                maxSessions: Math.min(20, Math.max(1, opts.opencodeMaxSessions ?? 3)),
                rowsPerSession: Math.min(20, Math.max(1, opts.opencodeRowsPerSession ?? 4)),
              });
              opencodeFeedError = null;
            } catch (e) {
              opencodeFeedError = e instanceof Error ? e.message : String(e);
            }
          }
          opencode_feed = opencodeFeedRows;
          opencode_feed_error = opencodeFeedError;
        }
        const line = JSON.stringify({
          ok: true as const,
          t: new Date().toISOString(),
          queue_workspace: opts.storageContext ?? null,
          ...summarize(tasks),
          ...(opts.opencodeFeed === true
            ? { opencode_feed, opencode_feed_error: opencode_feed_error ?? null }
            : {}),
        });
        process.stdout.write(`${line}\n`);
      } catch (e) {
        process.stdout.write(
          `${JSON.stringify({
            ok: false as const,
            t: new Date().toISOString(),
            error: e instanceof Error ? e.message : String(e),
          })}\n`,
        );
      }
    };

    const loop = async (): Promise<void> => {
      if (stopped) return;
      await tick();
      if (stopped) return;
      timeoutId = setTimeout(() => void loop(), opts.refreshMs);
    };

    void loop();

    const stop = (): void => {
      stopped = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
