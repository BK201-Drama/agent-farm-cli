import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 定位到含 `package.json` 的仓库根，与测试文件所在子目录深度无关。 */
export function getRepoRoot(fromImportMetaUrl: string): string {
  let dir = dirname(fileURLToPath(fromImportMetaUrl));
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("getRepoRoot: package.json not found");
    dir = parent;
  }
}
