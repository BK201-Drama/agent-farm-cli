import { useEffect, useState } from "react";
import {
  buildOpencodeFeed,
  type OpencodeFeedRow,
} from "../../../../../infrastructure/opencode/opencode-feed.js";

export type UseOpencodeFeedOpts = {
  enabled: boolean;
  workspaceRoot: string;
  refreshMs: number;
  maxSessions: number;
  rowsPerSession: number;
};

export type UseOpencodeFeedResult = {
  rows: OpencodeFeedRow[];
  err: string | null;
};

export function useOpencodeFeed(opts: UseOpencodeFeedOpts): UseOpencodeFeedResult {
  const [rows, setRows] = useState<OpencodeFeedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!opts.enabled) {
      setRows([]);
      setErr(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const next = await buildOpencodeFeed({
          workspaceRoot: opts.workspaceRoot,
          maxSessions: opts.maxSessions,
          rowsPerSession: opts.rowsPerSession,
        });
        if (!cancelled) {
          setRows(next);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
      if (!cancelled) {
        timer = setTimeout(() => void tick(), opts.refreshMs);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [
    opts.enabled,
    opts.workspaceRoot,
    opts.refreshMs,
    opts.maxSessions,
    opts.rowsPerSession,
  ]);

  return { rows, err };
}
