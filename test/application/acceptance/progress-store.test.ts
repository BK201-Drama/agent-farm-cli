import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptanceProgressPath,
  initProgressFromSpec,
  readProgress,
  writeProgress,
} from "../../../src/application/acceptance/progress-store.js";
import type { AcceptanceSpec } from "../../../src/application/acceptance/types.js";

function validSpec(overrides?: Partial<AcceptanceSpec>): AcceptanceSpec {
  return {
    poc_id: "test-poc",
    code_root: "./test-poc",
    demo: {
      id: "smoke",
      how: "Run the smoke test",
      verify: 'node -e "process.exit(0)"',
    },
    items: [
      {
        id: "ac-1",
        title: "First check",
        verify: "npm test",
        needs_human: false,
        depends_on: [],
      },
    ],
    ...overrides,
  };
}

// ── acceptanceProgressPath ──────────────────────────────────────────

describe("acceptanceProgressPath", () => {
  it("returns path under .agent-farm/acceptance/{pocId}.json", () => {
    const result = acceptanceProgressPath("/farm", "my-poc");
    expect(result).toBe(
      path.join("/farm", ".agent-farm", "acceptance", "my-poc.json"),
    );
  });

  it("handles relative farm root", () => {
    const result = acceptanceProgressPath(".", "noop");
    expect(result).toBe(
      path.join(".", ".agent-farm", "acceptance", "noop.json"),
    );
  });
});

// ── initProgressFromSpec ────────────────────────────────────────────

describe("initProgressFromSpec", () => {
  const now = "2026-07-29T00:00:00.000Z";

  it("sets items without depends_on to pending", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
      ],
    });
    const progress = initProgressFromSpec(spec, now);
    expect(progress.items["a"]).toBe("pending");
  });

  it("sets items with depends_on to blocked", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
      ],
    });
    const progress = initProgressFromSpec(spec, now);
    expect(progress.items["a"]).toBe("pending");
    expect(progress.items["b"]).toBe("blocked");
  });

  it("handles chain dependencies — only root is pending", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
        { id: "c", title: "C", verify: "cmd", needs_human: false, depends_on: ["b"] },
      ],
    });
    const progress = initProgressFromSpec(spec, now);
    expect(progress.items["a"]).toBe("pending");
    expect(progress.items["b"]).toBe("blocked");
    expect(progress.items["c"]).toBe("blocked");
  });

  it("item with multiple depends_on is blocked", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "c", title: "C", verify: "cmd", needs_human: false, depends_on: ["a", "b"] },
      ],
    });
    const progress = initProgressFromSpec(spec, now);
    expect(progress.items["a"]).toBe("pending");
    expect(progress.items["b"]).toBe("pending");
    expect(progress.items["c"]).toBe("blocked");
  });

  it("sets demo to locked", () => {
    const spec = validSpec();
    const progress = initProgressFromSpec(spec, now);
    expect(progress.demo).toBe("locked");
  });

  it("stores poc_id and code_root from spec", () => {
    const spec = validSpec();
    const progress = initProgressFromSpec(spec, now);
    expect(progress.poc_id).toBe("test-poc");
    expect(progress.code_root).toBe("./test-poc");
  });

  it("sets updated_at to the provided ISO string", () => {
    const spec = validSpec();
    const progress = initProgressFromSpec(spec, now);
    expect(progress.updated_at).toBe(now);
  });

  it("includes a deep-cloned spec_snapshot", () => {
    const spec = validSpec();
    const progress = initProgressFromSpec(spec, now);
    expect(progress.spec_snapshot).toEqual(spec);
    // Verify it's a clone, not the same reference
    expect(progress.spec_snapshot).not.toBe(spec);
    expect(progress.spec_snapshot.items).not.toBe(spec.items);
  });
});

// ── readProgress / writeProgress roundtrip ──────────────────────────

describe("readProgress / writeProgress", () => {
  async function withTempDir(
    fn: (dir: string) => Promise<void>,
  ): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "af-progress-test-"));
    try {
      await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it("writeProgress creates parent directories and writes JSON", () => {
    return withTempDir(async (dir) => {
      const filePath = path.join(dir, "nested", "sub", "my-poc.json");
      const spec = validSpec();
      const progress = initProgressFromSpec(spec, "2026-07-29T00:00:00.000Z");

      await writeProgress(filePath, progress);

      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.poc_id).toBe("test-poc");
      expect(parsed.demo).toBe("locked");
      expect(parsed.items["ac-1"]).toBe("pending");
    });
  });

  it("readProgress returns null for missing file", () => {
    return withTempDir(async (dir) => {
      const filePath = path.join(dir, "nonexistent.json");
      const result = await readProgress(filePath);
      expect(result).toBeNull();
    });
  });

  it("readProgress returns null for malformed JSON", () => {
    return withTempDir(async (dir) => {
      const filePath = path.join(dir, "bad.json");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "not json", "utf-8");

      const result = await readProgress(filePath);
      expect(result).toBeNull();
    });
  });

  it("readProgress returns null for JSON missing required fields", () => {
    return withTempDir(async (dir) => {
      const filePath = path.join(dir, "incomplete.json");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ poc_id: "x" }), "utf-8");

      const result = await readProgress(filePath);
      expect(result).toBeNull();
    });
  });

  it("roundtrip: write then read returns identical data", () => {
    return withTempDir(async (dir) => {
      const filePath = path.join(dir, "roundtrip.json");
      const spec = validSpec({
        items: [
          { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
          { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
        ],
      });
      const progress = initProgressFromSpec(spec, "2026-07-29T00:00:00.000Z");

      await writeProgress(filePath, progress);
      const read = await readProgress(filePath);

      expect(read).not.toBeNull();
      expect(read!.poc_id).toBe(progress.poc_id);
      expect(read!.code_root).toBe(progress.code_root);
      expect(read!.updated_at).toBe(progress.updated_at);
      expect(read!.demo).toBe(progress.demo);
      expect(read!.items).toEqual(progress.items);
      expect(read!.spec_snapshot).toEqual(progress.spec_snapshot);
    });
  });

  it("overwrites existing progress file", () => {
    return withTempDir(async (dir) => {
      const filePath = path.join(dir, "overwrite.json");
      const spec1 = validSpec({ poc_id: "first" });
      const spec2 = validSpec({ poc_id: "second" });

      const p1 = initProgressFromSpec(spec1, "2026-01-01T00:00:00.000Z");
      const p2 = initProgressFromSpec(spec2, "2026-07-29T00:00:00.000Z");

      await writeProgress(filePath, p1);
      await writeProgress(filePath, p2);

      const read = await readProgress(filePath);
      expect(read!.poc_id).toBe("second");
      expect(read!.updated_at).toBe("2026-07-29T00:00:00.000Z");
    });
  });
});
