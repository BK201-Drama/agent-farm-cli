/**
 * bootstrap 容器冒烟测试
 *
 * 验证 DI 容器能正确装配所有主要端口和服务，不出现连线错误。
 * 这些测试弥补 bootstrap 层原本零测试覆盖的缺口。
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createContainer } from "../../src/bootstrap/container.js";
import { defaultContainerPorts } from "../../src/bootstrap/container-ports.js";
import type { ContainerPorts } from "../../src/application/contracts/container-ports.js";

describe("bootstrap container smoke tests", () => {
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

  describe("createContainer (composition root)", () => {
    it("resolves sqlite taskRepo without error", () => {
      dir = join(tmpdir(), `farm-bt-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const db = join(dir, "test.db");
      const c = createContainer({
        storage: "sqlite",
        dbFile: db,
        taskFile: join(dir, "tasks.jsonl"),
        eventFile: join(dir, "events.jsonl"),
        quarantineFile: join(dir, "quarantine.jsonl"),
      });
      expect(c.taskRepo).toBeDefined();
      expect(c.eventRepo).toBeDefined();
      expect(c.quarantineRepo).toBeDefined();
    });

    it("resolves sqlite queueService and adds a task", async () => {
      dir = join(tmpdir(), `farm-bt-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const db = join(dir, "test.db");
      const c = createContainer({
        storage: "sqlite",
        dbFile: db,
        taskFile: join(dir, "tasks.jsonl"),
        eventFile: join(dir, "events.jsonl"),
        quarantineFile: join(dir, "quarantine.jsonl"),
      });
      const row = await c.queueService.addTask({
        task_id: "smoke-test-1",
        prompt: "verify container wiring",
        dedupe_key: "smoke-dk",
      });
      expect(row.task_id).toBe("smoke-test-1");
      expect(row.status).toBe("queued");
    });

    it("resolves jsonl queueService and adds a task", async () => {
      dir = join(tmpdir(), `farm-bt-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const taskFile = join(dir, "tasks.jsonl");
      const eventFile = join(dir, "events.jsonl");
      const quarantineFile = join(dir, "quarantine.jsonl");
      const c = createContainer({
        storage: "jsonl",
        taskFile,
        eventFile,
        quarantineFile,
      });
      const row = await c.queueService.addTask({
        task_id: "smoke-jsonl-1",
        prompt: "jsonl wiring",
        dedupe_key: "smoke-jsonl",
      });
      expect(row.task_id).toBe("smoke-jsonl-1");
    });

    it("resolves insightsService without error", () => {
      dir = join(tmpdir(), `farm-bt-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const db = join(dir, "test.db");
      const c = createContainer({
        storage: "sqlite",
        dbFile: db,
        taskFile: join(dir, "tasks.jsonl"),
        eventFile: join(dir, "events.jsonl"),
        quarantineFile: join(dir, "quarantine.jsonl"),
      });
      expect(c.insightsService).toBeDefined();
      expect(typeof c.insightsService.build).toBe("function");
    });

    it("resolves doctorService without error", () => {
      dir = join(tmpdir(), `farm-bt-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const db = join(dir, "test.db");
      const c = createContainer({
        storage: "sqlite",
        dbFile: db,
        taskFile: join(dir, "tasks.jsonl"),
        eventFile: join(dir, "events.jsonl"),
        quarantineFile: join(dir, "quarantine.jsonl"),
      });
      expect(c.doctorService).toBeDefined();
    });

    it("resolves statusService without error", () => {
      dir = join(tmpdir(), `farm-bt-${process.pid}-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const db = join(dir, "test.db");
      const c = createContainer({
        storage: "sqlite",
        dbFile: db,
        taskFile: join(dir, "tasks.jsonl"),
        eventFile: join(dir, "events.jsonl"),
        quarantineFile: join(dir, "quarantine.jsonl"),
      });
      expect(c.statusService).toBeDefined();
    });

    it("resolves ports (gitWorkspace, projectConfig) without error", () => {
      const ports = defaultContainerPorts();
      expect(ports.gitWorkspace).toBeDefined();
      expect(ports.projectConfig).toBeDefined();
      expect(typeof ports.gitWorkspace.resolveGitTopLevel).toBe("function");
      expect(typeof ports.projectConfig.load).toBe("function");
    });

    it("allows port overrides for testability", () => {
      const mockGit = { resolveGitTopLevel: () => null } as ContainerPorts["gitWorkspace"];
      const overridePorts: Partial<ContainerPorts> = {
        gitWorkspace: mockGit as ContainerPorts["gitWorkspace"],
      };
      const ports = defaultContainerPorts(overridePorts);
      expect(ports.gitWorkspace).toBe(mockGit);
      // projectConfig should still be the default
      expect(ports.projectConfig).toBeDefined();
    });
  });
});
