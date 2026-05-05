import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { openDb } from "../persistence/sqlite/db.js";
import { generateDispatchScript } from "../templates/dispatch.js";
import type { ProjectInitGateway } from "../../application/ports/project-init-gateway.js";

export function createNodeProjectInitGateway(): ProjectInitGateway {
  return {
    async mkdirRecursive(path: string): Promise<void> {
      await mkdir(path, { recursive: true });
    },
    async fileExists(path: string): Promise<boolean> {
      try {
        await access(path, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
    async writeUtf8File(path: string, content: string): Promise<void> {
      await writeFile(path, content, "utf8");
    },
    async trySetExecutable(path: string, mode: number): Promise<void> {
      try {
        await chmod(path, mode);
      } catch {
        /* Windows 等环境可能忽略可执行位 */
      }
    },
    async warmSqliteSchema(dbFile: string): Promise<void> {
      openDb(dbFile);
    },
    buildDispatchScript(opts: { workers: number; commandTemplate?: string }): string {
      return generateDispatchScript(opts);
    },
  };
}
