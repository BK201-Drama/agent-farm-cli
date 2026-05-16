import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ControlPlaneService } from "../../src/application/facades/control-plane.js";

describe("ControlPlaneService", () => {
  it("buildView on empty jsonl queue", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-cp-"));
    const q = join(dir, ".agent-farm", "queue");
    mkdirSync(q, { recursive: true });
    writeFileSync(join(q, "tasks.jsonl"), "");
    writeFileSync(join(q, "events.jsonl"), "");
    writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
    const prev = process.env.AGENT_FARM_STORAGE;
    process.env.AGENT_FARM_STORAGE = "jsonl";
    try {
      const svc = new ControlPlaneService(dir);
      const view = await svc.buildView();
      expect(view.ok).toBe(true);
      expect(view.stuck.items).toEqual([]);
      expect(view.status.tasks_total).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.AGENT_FARM_STORAGE;
      else process.env.AGENT_FARM_STORAGE = prev;
    }
  });
});
