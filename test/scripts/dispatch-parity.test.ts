import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);

describe("dispatch scripts worker parity", () => {
  it("single-task Node dispatch adds --auto-merge when AGENT_FARM_AUTO_MERGE is not disabled (matches batch)", () => {
    const dispatch = readFileSync(join(repoRoot, "scripts/agent-farm-dispatch.mjs"), "utf8");
    expect(dispatch).toContain("AGENT_FARM_AUTO_MERGE");
    expect(dispatch).toContain('"--auto-merge"');
    expect(dispatch).toContain("--isolate-opencode-db");
  });

  it("batch Node dispatch uses the same auto-merge gate", () => {
    const batch = readFileSync(join(repoRoot, "scripts/agent-farm-dispatch-batch.mjs"), "utf8");
    expect(batch).toContain("AGENT_FARM_AUTO_MERGE");
    expect(batch).toContain('"--auto-merge"');
  });

  it("single-task bash dispatch adds --auto-merge when env allows (matches batch.sh)", () => {
    const sh = readFileSync(join(repoRoot, "scripts/agent-farm-dispatch.sh"), "utf8");
    expect(sh).toContain("AGENT_FARM_AUTO_MERGE");
    expect(sh).toContain("--auto-merge");
  });
});
