#!/usr/bin/env node
/**
 * 直接调用 cursor-sdk executor（不入队）。需 CURSOR_API_KEY + 可选 @cursor/sdk。
 * npm run farm:cursor-sdk:smoke
 */
import { createCursorSdkExecutor } from "../dist/infrastructure/executors/cursor-sdk-executor.js";

const ex = createCursorSdkExecutor();
const result = await ex.run({
  task_id: "smoke",
  prompt: "Reply with exactly: AGENT_FARM_CURSOR_SDK_OK",
  workspace_dir: process.cwd(),
  attempt: 1,
  read_paths: ["README.md"],
});

console.log(JSON.stringify({ exit_code: result.exit_code, output_preview: result.output.slice(0, 500) }, null, 2));
process.exit(result.exit_code === 0 ? 0 : 1);
