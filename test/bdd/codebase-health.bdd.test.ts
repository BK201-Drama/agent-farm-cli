/**
 * BDD: 代码库健康行为回归测试
 *
 * 覆盖本周/下周优化项：
 * - zod 作为直接依赖可用
 * - 空目录已清理
 * - bootstrap 容器健康
 * - 过期分支已删除
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);

describe("BDD: codebase health regression", () => {
  describe("zod dependency health", () => {
    it("Given agent-farm-cli is installed When importing zod Then zod resolves as a usable module", async () => {
      // zod must be directly importable (not just transitive)
      const zod = await import("zod");
      expect(zod).toBeDefined();
      expect(zod.z).toBeDefined();
    });

    it("Given zod is available When using z.string() and z.object() Then schema validation works", async () => {
      const { z } = await import("zod");
      const schema = z.object({
        task_id: z.string(),
        prompt: z.string(),
      });
      const valid = schema.safeParse({ task_id: "t1", prompt: "hello" });
      expect(valid.success).toBe(true);

      const invalid = schema.safeParse({ task_id: 123 });
      expect(invalid.success).toBe(false);
    });

    it("Given zod is listed in package.json When checking dependencies Then zod is a direct dependency", () => {
      const pkgRaw = readFileSync(join(repoRoot, "package.json"), "utf8");
      const pkg = JSON.parse(pkgRaw);
      expect(pkg.dependencies).toHaveProperty("zod");
      // verify the version string looks like a semver range
      expect(pkg.dependencies.zod).toMatch(/^\^?\d+\.\d+\.\d+/);
    });
  });

  describe("empty directories cleaned", () => {
    const emptyDirs = [
      "src/application/roadmap",
      "src/application/services",
      "src/domain/worker",
    ];

    it("Given the source tree When listing empty directories Then none of the previously-empty dirs exist", () => {
      for (const dir of emptyDirs) {
        const fullPath = join(repoRoot, dir);
        expect(existsSync(fullPath), `${dir} should not exist`).toBe(false);
      }
    });
  });

  describe("stale branches removed", () => {
    it("Given the git repository When listing local branches Then stale feature branches are absent", () => {
      const output = execSync("git branch --list", {
        cwd: repoRoot,
        encoding: "utf8",
      });
      // These stale branches should no longer exist locally
      expect(output).not.toContain("feat/personal-team-ci-0.1.42");
      expect(output).not.toContain("feat/roadmap-phase2-v2");
    });
  });

  describe("bootstrap container health", () => {
    let dir = "";

    afterEach(() => {
      if (dir) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      dir = "";
    });

    it("Given a fresh SQLite DB When createContainer wires all services Then all services are non-null", async () => {
      const { createContainer } = await import("../../src/bootstrap/container.js");
      dir = join(tmpdir(), `farm-bdd-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const db = join(dir, "test.db");
      const c = createContainer({
        storage: "sqlite",
        dbFile: db,
        taskFile: join(dir, "tasks.jsonl"),
        eventFile: join(dir, "events.jsonl"),
        quarantineFile: join(dir, "quarantine.jsonl"),
      });

      // All 4 services + 3 repos must resolve
      expect(c.queueService, "queueService").toBeDefined();
      expect(c.insightsService, "insightsService").toBeDefined();
      expect(c.doctorService, "doctorService").toBeDefined();
      expect(c.statusService, "statusService").toBeDefined();
      expect(c.taskRepo, "taskRepo").toBeDefined();
      expect(c.eventRepo, "eventRepo").toBeDefined();
      expect(c.quarantineRepo, "quarantineRepo").toBeDefined();
    });

    it("Given a container When adding and listing tasks Then roundtrip succeeds", async () => {
      const { createContainer } = await import("../../src/bootstrap/container.js");
      dir = join(tmpdir(), `farm-bdd-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const db = join(dir, "test.db");
      const c = createContainer({
        storage: "sqlite",
        dbFile: db,
        taskFile: join(dir, "tasks.jsonl"),
        eventFile: join(dir, "events.jsonl"),
        quarantineFile: join(dir, "quarantine.jsonl"),
      });

      await c.queueService.addTask({ task_id: "bdd-1", prompt: "p1", dedupe_key: "dk1" });
      await c.queueService.addTask({ task_id: "bdd-2", prompt: "p2", dedupe_key: "dk2" });

      const list = await c.queueService.listTasks();
      expect(list.length).toBeGreaterThanOrEqual(2);
      const ids = list.map((t: { task_id: string }) => t.task_id);
      expect(ids).toContain("bdd-1");
      expect(ids).toContain("bdd-2");
    });

    it("Given defaultContainerPorts When resolving Then gitWorkspace.resolveGitTopLevel returns repo root", async () => {
      const { defaultContainerPorts } = await import("../../src/bootstrap/container-ports.js");
      const ports = defaultContainerPorts();
      // resolveGitTopLevel should find the git top-level in the repo root
      const top = ports.gitWorkspace.resolveGitTopLevel(repoRoot);
      expect(top).toBeTruthy();
      expect(typeof top).toBe("string");
    });
  });
});
