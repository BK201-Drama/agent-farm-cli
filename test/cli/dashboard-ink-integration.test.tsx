import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render } from "ink";
import { TaskDashboard } from "../../src/interfaces/cli/tui/task-dashboard/app.js";
import { wrapStdoutForInkFullRedraw } from "../../src/interfaces/cli/tui/task-dashboard/ink-stdout.js";

/**
 * Ink 在 outputHeight < stdout.rows 时用 log-update，部分终端会错位堆叠；
 * 根 Box 固定 height=rows 后应走 clearTerminal 全屏重绘（含 ESC [ 2 J）。
 */
describe("TaskDashboard + Ink small terminal", () => {
  const instances: { unmount: () => void }[] = [];

  afterEach(() => {
    while (instances.length > 0) {
      const i = instances.pop();
      try {
        i?.unmount();
      } catch {
        /* ignore */
      }
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("writes full-screen clear sequence when stdout.rows is small (not log-update-only)", async () => {
    vi.stubEnv("AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR", "1");
    const stdout = new PassThrough() as NodeJS.WriteStream & { columns: number; rows: number };
    stdout.columns = 100;
    stdout.rows = 18;
    stdout.isTTY = true;

    let combined = "";
    stdout.on("data", (c: Buffer | string) => {
      combined += typeof c === "string" ? c : c.toString("utf8");
    });

    const stdin = new PassThrough();
    stdin.isTTY = false;

    const inst = render(
      <TaskDashboard
        listTasks={() => Promise.resolve([])}
        refreshMs={40}
        storageLines={["cwd: /tmp", "storage: sqlite · /x.db"]}
      />,
      { stdout: wrapStdoutForInkFullRedraw(stdout), stdin, exitOnCtrlC: false },
    );
    instances.push(inst);

    await new Promise((r) => setTimeout(r, 180));
    inst.unmount();

    expect(combined).toMatch(/\x1b\[2J/);
  });
});
