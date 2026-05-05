import { useEffect, useRef, useState } from "react";
import type { TaskRecord } from "../../../../../domain/task.js";
import { tasksFingerprint } from "../helpers.js";

export type UseTaskPollResult = {
  tasks: TaskRecord[];
  err: string | null;
  lastOk: Date | null;
  cols: number;
};

export function useTaskPoll(
  listTasks: () => Promise<TaskRecord[]>,
  refreshMs: number,
): UseTaskPollResult {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<Date | null>(null);
  const [cols, setCols] = useState(() => process.stdout.columns ?? 88);
  const failRef = useRef(0);

  useEffect(() => {
    const onResize = (): void => {
      setCols(process.stdout.columns ?? 88);
    };
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const loop = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const rows = await listTasks();
        if (cancelled) return;
        failRef.current = 0;
        setErr(null);
        setTasks((prev) => (tasksFingerprint(prev) === tasksFingerprint(rows) ? prev : rows));
        setLastOk(new Date());
        if (!cancelled) timeoutId = setTimeout(() => void loop(), refreshMs);
      } catch (e) {
        failRef.current += 1;
        setErr(e instanceof Error ? e.message : String(e));
        const backoff = Math.min(30_000, refreshMs * 2 ** Math.min(failRef.current, 5));
        if (!cancelled) timeoutId = setTimeout(() => void loop(), backoff);
      }
    };

    void loop();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [listTasks, refreshMs]);

  return { tasks, err, lastOk, cols };
}
