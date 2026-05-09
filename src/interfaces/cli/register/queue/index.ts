import type { Command } from "commander";
import { registerQueueAdd } from "./add.js";
import { registerQueueBatchCancel } from "./batch-cancel.js";
import { registerQueueClaim } from "./claim.js";
import { registerQueueEvents } from "./events.js";
import { registerQueueExport } from "./export.js";
import { registerQueueList } from "./list.js";
import { registerQueueMaintenanceCommands } from "./maintenance.js";
import { registerQueueReviewCommands } from "./review.js";
import { registerQueueShow } from "./show.js";
import { registerQueueSnapshot } from "./snapshot.js";
import { registerQueueUpdate } from "./update.js";
import { registerQueueWorktreeCleanup } from "./worktree-cleanup.js";

export function registerQueueCommands(program: Command): void {
  const queue = program.command("queue");
  registerQueueAdd(queue);
  registerQueueList(queue);
  registerQueueShow(queue);
  registerQueueSnapshot(queue);
  registerQueueExport(queue);
  registerQueueEvents(queue);
  registerQueueBatchCancel(queue);
  registerQueueClaim(queue);
  registerQueueUpdate(queue);
  registerQueueReviewCommands(queue);
  registerQueueMaintenanceCommands(queue);
  registerQueueWorktreeCleanup(queue);
}
