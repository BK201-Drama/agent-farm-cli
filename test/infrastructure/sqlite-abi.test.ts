import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import {
  findAgentFarmPackageRoot,
  isLikelyNodeAbiMismatch,
  tryRebuildBetterSqlite3,
} from "../../src/infrastructure/persistence/sqlite/db.js";

describe("isLikelyNodeAbiMismatch", () => {
  it("detects NODE_MODULE_VERSION in message", () => {
    expect(isLikelyNodeAbiMismatch(new Error("NODE_MODULE_VERSION mismatch 93 vs 108"))).toBe(true);
  });

  it("detects 'was compiled against a different Node.js'", () => {
    expect(isLikelyNodeAbiMismatch(new Error("was compiled against a different Node.js version"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isLikelyNodeAbiMismatch(new Error("WAS COMPILED AGAINST A DIFFERENT NODE.JS"))).toBe(true);
    expect(isLikelyNodeAbiMismatch(new Error("node_module_version error"))).toBe(true);
  });

  it("returns false for unrelated error messages", () => {
    expect(isLikelyNodeAbiMismatch(new Error("module not found"))).toBe(false);
    expect(isLikelyNodeAbiMismatch(new Error("cannot find module 'better-sqlite3'"))).toBe(false);
    expect(isLikelyNodeAbiMismatch(new Error(""))).toBe(false);
  });

  it("handles non-Error input gracefully", () => {
    expect(isLikelyNodeAbiMismatch("some string")).toBe(false);
    expect(isLikelyNodeAbiMismatch(undefined)).toBe(false);
    expect(isLikelyNodeAbiMismatch(null)).toBe(false);
    expect(isLikelyNodeAbiMismatch({ message: "NODE_MODULE_VERSION" })).toBe(false);
  });
});

describe("findAgentFarmPackageRoot", () => {
  let root = "";

  afterEach(() => {
    if (!root) return;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    root = "";
  });

  function makeTempRoot() {
    root = join(tmpdir(), `agent-farm-pkgroot-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(root, { recursive: true });
  }

  it("finds package root by walking up from nested dir", () => {
    makeTempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-farm-cli" }));
    const deep = join(root, "a", "b", "c");
    mkdirSync(deep, { recursive: true });
    expect(findAgentFarmPackageRoot(deep)).toBe(root);
  });

  it("returns null when no agent-farm-cli package.json exists", () => {
    makeTempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "other-package" }));
    expect(findAgentFarmPackageRoot(root)).toBeNull();
  });

  it("skips package.json without name field and continues walking", () => {
    makeTempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-farm-cli" }));
    const mid = join(root, "sub");
    mkdirSync(mid, { recursive: true });
    writeFileSync(join(mid, "package.json"), JSON.stringify({ version: "1.0.0" }));
    const deep = join(mid, "nested");
    mkdirSync(deep, { recursive: true });
    expect(findAgentFarmPackageRoot(deep)).toBe(root);
  });

  it("skips malformed package.json and continues walking", () => {
    makeTempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-farm-cli" }));
    const mid = join(root, "sub");
    mkdirSync(mid, { recursive: true });
    writeFileSync(join(mid, "package.json"), "not valid json {{{");
    const deep = join(mid, "nested");
    mkdirSync(deep, { recursive: true });
    expect(findAgentFarmPackageRoot(deep)).toBe(root);
  });

  it("returns null when no package.json along the way", () => {
    makeTempRoot();
    const deep = join(root, "x", "y", "z");
    mkdirSync(deep, { recursive: true });
    expect(findAgentFarmPackageRoot(deep)).toBeNull();
  });

  it("stops walking at 24 levels limit", () => {
    makeTempRoot();
    let dir = root;
    for (let i = 0; i < 30; i++) {
      dir = join(dir, `d${i}`);
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-farm-cli" }));
    expect(findAgentFarmPackageRoot(dir)).toBeNull();
  });

  it("finds root at exact start directory", () => {
    makeTempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "agent-farm-cli" }));
    expect(findAgentFarmPackageRoot(root)).toBe(root);
  });
});

describe("tryRebuildBetterSqlite3", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  it("calls spawnSync with correct args", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
    tryRebuildBetterSqlite3("/some/path");
    expect(spawnSync).toHaveBeenCalledWith("npm", ["rebuild", "better-sqlite3", "--foreground-scripts"], {
      cwd: "/some/path",
      stdio: "inherit",
      shell: true,
      env: expect.any(Object) as unknown,
    });
  });

  it("returns true when npm rebuild succeeds (status 0)", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
    expect(tryRebuildBetterSqlite3("/some/path")).toBe(true);
  });

  it("returns false when npm rebuild fails (non-zero status)", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    expect(tryRebuildBetterSqlite3("/some/path")).toBe(false);
  });
});
