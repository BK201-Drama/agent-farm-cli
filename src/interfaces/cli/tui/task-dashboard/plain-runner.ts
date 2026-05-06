import type { JsonMap, TaskRecord } from "../../../../domain/task.js";
import { partitionSortedTasks } from "./helpers.js";

export type RunPlainDashboardOpts = {
  listTasks: () => Promise<TaskRecord[]>;
  refreshMs: number;
  storageContext?: JsonMap;
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

    const tick = async (): Promise<void> => {
      try {
        const tasks = await opts.listTasks();
        const line = JSON.stringify({
          ok: true as const,
          t: new Date().toISOString(),
          queue_workspace: opts.storageContext ?? null,
          ...summarize(tasks),
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
