import { describe, expect, it } from "vitest";
import { buildTaskTimeline } from "../../src/application/facades/task-timeline.js";

describe("buildTaskTimeline", () => {
  it("merges events and execute reports by ts", () => {
    const tl = buildTaskTimeline(
      "t1",
      [
        { ts: "2026-05-16T10:00:00Z", event: "task_running", task_id: "t1" },
        { ts: "2026-05-16T10:05:00Z", event: "task_done", task_id: "t1" },
        { ts: "2026-05-16T10:00:00Z", event: "task_running", task_id: "other" },
      ],
      [
        {
          schema_version: 1,
          task_id: "t1",
          attempt: 0,
          stage: "execute",
          finished_at: "2026-05-16T10:02:00Z",
          exit_code: 0,
          output_bytes: 10,
          output_preview: "ok",
        },
      ],
    );
    expect(tl).toHaveLength(3);
    expect(tl.map((x) => x.kind)).toEqual(["event", "execute_report", "event"]);
  });
});
