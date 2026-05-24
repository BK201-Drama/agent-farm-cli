import type {
  TaskExecutorPort,
  TaskExecutorRunInput,
  TaskExecutorRunResult,
} from "../../domain/ports/task-executor.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import { expandCommandTemplate, type TemplateContext } from "../worker/command-template.js";
import { runShellWithOptionalOpencodeJsonStream } from "../../infrastructure/executors/opencode-shell-runner.js";
import type { AgentStreamObserver } from "../../domain/ports/agent-stream-observer.js";

export const SHELL_TEMPLATE_EXECUTOR_ID = "shell-template";

export type ShellTemplateExecutorDeps = {
  commandTemplate: string;
  getTemplateContext: () => TemplateContext;
  runShell: ShellRunner;
  env: NodeJS.ProcessEnv;
  onHeartbeat: () => Promise<void>;
  shouldAbort?: () => Promise<boolean>;
  onStreamObserver?: (obs: AgentStreamObserver) => void;
  enableOpencodeStream: boolean;
};

/** ADR-001：command-template + ShellRunner（含 OpenCode NDJSON 可选路径） */
export function createShellTemplateExecutor(deps: ShellTemplateExecutorDeps): TaskExecutorPort {
  return {
    id: SHELL_TEMPLATE_EXECUTOR_ID,
    async run(input: TaskExecutorRunInput): Promise<TaskExecutorRunResult> {
      const ctx: TemplateContext = {
        ...deps.getTemplateContext(),
        workspace: input.workspace_dir,
        prompt: input.prompt,
        task_id: input.task_id,
      };
      const cmd = expandCommandTemplate(deps.commandTemplate, ctx);
      const { exitCode, output, streamObs } = await runShellWithOptionalOpencodeJsonStream(cmd, {
        runShell: deps.runShell,
        onHeartbeat: deps.onHeartbeat,
        shouldAbort: deps.shouldAbort,
        onStreamObserver: deps.onStreamObserver,
        env: deps.env,
        enableStream: deps.enableOpencodeStream,
      });
      return {
        exit_code: exitCode,
        output,
        ...(streamObs ? { meta: { streamObs } } : {}),
      };
    },
  };
}
