import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createControlPlaneService,
  createContainer,
  resolveExecutorId,
  validateWaveArray,
  validateWaveItem,
  CURSOR_SDK_EXECUTOR_ID,
} from "../../src/application/public-api.js";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);

describe("public-api embed surface (TDD)", () => {
  it("validateWaveItem rejects execute without acceptance_criteria", () => {
    expect(() =>
      validateWaveItem({
        task_id: "t1",
        dedupe_key: "d1",
        mode: "execute",
        prompt: "x".repeat(50),
      }),
    ).toThrow(/acceptance_criteria/i);
  });

  it("validateWaveArray returns warnings for soft issues", () => {
    const warnings = validateWaveArray(
      [
        {
          task_id: "embed-t1",
          dedupe_key: "embed:t1",
          mode: "execute",
          prompt: "Read README then run npm run check with no unrelated edits in repo root.",
          acceptance_criteria: "npm run check",
        },
      ],
      "public-api-test",
    );
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("createControlPlaneService buildHealth returns service id", async () => {
    const svc = createControlPlaneService(repoRoot);
    const health = await svc.buildHealth();
    expect(health.service).toBe("agent-farm-control-plane");
    expect(typeof health.version).toBe("string");
  });

  it("resolveExecutorId returns config executor id", () => {
    expect(resolveExecutorId({}, { executor: "cursor-sdk" })).toBe(CURSOR_SDK_EXECUTOR_ID);
    expect(resolveExecutorId({}, { executor: "opencode" })).toBe("opencode");
    expect(resolveExecutorId({}, null)).toBe("shell-template");
  });

  it("createContainer loads without throw when sqlite db may exist", () => {
    const db = join(repoRoot, ".agent-farm/queue/agent_farm.db");
    const storage = existsSync(db) ? "sqlite" : "jsonl";
    const container = createContainer({
      storage,
      dbFile: db,
      taskFile: join(repoRoot, ".agent-farm/queue/tasks.jsonl"),
      eventFile: join(repoRoot, ".agent-farm/queue/events.jsonl"),
      quarantineFile: join(repoRoot, ".agent-farm/queue/quarantine_tasks.jsonl"),
    });
    expect(container.ports).toBeDefined();
  });
});
