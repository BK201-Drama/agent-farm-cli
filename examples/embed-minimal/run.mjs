#!/usr/bin/env node
/**
 * 从仓库根运行：npm run build && node examples/embed-minimal/run.mjs
 */
import {
  createControlPlaneService,
  createContainer,
  resolveExecutorId,
  validateWaveArray,
} from "../../dist/application/public-api.js";

const cwd = process.cwd();
const container = createContainer({
  storage: "sqlite",
  dbFile: `${cwd}/.agent-farm/queue/agent_farm.db`,
  taskFile: `${cwd}/.agent-farm/queue/tasks.jsonl`,
  eventFile: `${cwd}/.agent-farm/queue/events.jsonl`,
  quarantineFile: `${cwd}/.agent-farm/queue/quarantine_tasks.jsonl`,
});

const svc = createControlPlaneService(cwd);
const health = await svc.buildHealth();
const view = await svc.buildView({ topN: 3 });
const projectCfg = container.ports.projectConfig.load(cwd);
const executorId = resolveExecutorId({}, projectCfg);

const waveWarnings = validateWaveArray(
  [
    {
      task_id: "embed-demo",
      dedupe_key: "embed:demo",
      mode: "execute",
      prompt: "仓库根示例。先 Read README.md。禁止长时间无 git diff。验收：npm run check",
      acceptance_criteria: "npm run check",
    },
  ],
  "embed-minimal",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      executor_id: executorId,
      wave_warnings: waveWarnings.length,
      health,
      tasks_total: view.status.tasks_total,
      stuck_count: view.stuck.items.length,
      pipeline_ids: (view.board.pipeline ?? []).slice(0, 5).map((t) => t.task_id),
    },
    null,
    2,
  ),
);
