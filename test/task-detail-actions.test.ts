import { describe, expect, it } from "vitest";
import { getAvailableActions } from "../src/interfaces/cli/tui/task-dashboard/helpers/index.js";

describe("getAvailableActions", () => {
  it("returns approve/reject for review status", () => {
    const actions = getAvailableActions("review");
    expect(actions).toContain("a:批准");
    expect(actions).toContain("r:驳回");
    expect(actions).toHaveLength(2);
  });

  it("returns cancel for queued status", () => {
    const actions = getAvailableActions("queued");
    expect(actions).toEqual(["c:取消"]);
  });

  it("returns cancel for retry status", () => {
    const actions = getAvailableActions("retry");
    expect(actions).toEqual(["c:取消"]);
  });

  it("returns empty for other statuses", () => {
    const statuses: import("../src/domain/task.js").TaskStatus[] = [
      "claimed",
      "running",
      "approved",
      "rejected",
      "done",
      "failed",
      "cancelled",
      "blocked",
    ];
    for (const status of statuses) {
      expect(getAvailableActions(status)).toEqual([]);
    }
  });
});