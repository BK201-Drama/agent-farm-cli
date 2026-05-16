import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src/interfaces/control-plane/panel-core.js");
const targets = [
  join(root, "dist/interfaces/control-plane/panel-core.js"),
  join(root, "extensions/agent-farm-sidebar/media/panel-core.js"),
];

for (const dest of targets) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
