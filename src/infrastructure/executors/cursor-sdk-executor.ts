import type { TaskExecutorPort, TaskExecutorRunInput, TaskExecutorRunResult } from "../../domain/ports/task-executor.js";

export const CURSOR_SDK_EXECUTOR_ID = "cursor-sdk";

type CursorPromptResult = { status?: string; result?: string };

type CursorAgentPrompt = (
  prompt: string,
  opts: {
    apiKey: string;
    model?: { id: string };
    local?: { cwd: string };
  },
) => Promise<CursorPromptResult>;

type CursorAgentModule = {
  Agent?: {
    prompt: CursorAgentPrompt;
    create?: (opts: {
      apiKey: string;
      model?: { id: string };
      local?: { cwd: string };
    }) => {
      send: (prompt: string) => Promise<{ stream: () => AsyncIterable<CursorStreamEvent> }>;
      dispose?: () => void;
    };
  };
};

type CursorStreamEvent = {
  type?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
};

async function loadCursorAgent(): Promise<NonNullable<CursorAgentModule["Agent"]> | null> {
  try {
    const sdkSpec = "@cursor/sdk";
    const mod = (await import(sdkSpec)) as CursorAgentModule;
    if (!mod.Agent?.prompt) return null;
    return mod.Agent;
  } catch {
    return null;
  }
}

function streamEventsToText(events: AsyncIterable<CursorStreamEvent>): Promise<string> {
  return (async () => {
    let output = "";
    for await (const event of events) {
      if (event.type !== "assistant") continue;
      for (const block of event.message?.content ?? []) {
        if (block.type === "text" && block.text) output += block.text;
      }
    }
    return output;
  })();
}

async function runWithCursorSdk(
  Agent: NonNullable<CursorAgentModule["Agent"]>,
  input: TaskExecutorRunInput,
  apiKey: string,
  modelId: string,
): Promise<TaskExecutorRunResult> {
  const opts = {
    apiKey,
    model: { id: modelId },
    local: { cwd: input.workspace_dir },
  };
  const useStream =
    process.env.AGENT_FARM_CURSOR_SDK_STREAM === "1" ||
    process.env.AGENT_FARM_CURSOR_SDK_STREAM === "true";

  if (useStream && Agent.create) {
    const agent = Agent.create(opts);
    try {
      const run = await agent.send(input.prompt);
      const output = await streamEventsToText(run.stream());
      return { exit_code: 0, output, meta: { cursor_sdk_mode: "stream" } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { exit_code: 1, output: `cursor-sdk Agent.send/stream failed: ${msg}` };
    } finally {
      agent.dispose?.();
    }
  }

  try {
    const result = await Agent.prompt(input.prompt, opts);
    const output = String(result.result ?? "");
    const ok =
      String(result.status ?? "").toLowerCase() === "completed" || result.status === undefined;
    return { exit_code: ok ? 0 : 1, output, meta: { cursor_sdk_mode: "prompt" } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { exit_code: 1, output: `cursor-sdk Agent.prompt failed: ${msg}` };
  }
}

/**
 * ADR-002：可选依赖 `@cursor/sdk`（未安装时返回明确错误，不进入默认 install）。
 */
export function createCursorSdkExecutor(): TaskExecutorPort {
  return {
    id: CURSOR_SDK_EXECUTOR_ID,
    async run(input: TaskExecutorRunInput): Promise<TaskExecutorRunResult> {
      const apiKey = process.env.CURSOR_API_KEY?.trim();
      if (!apiKey) {
        return {
          exit_code: 127,
          output:
            "cursor-sdk executor: set CURSOR_API_KEY. Or use AGENT_FARM_EXECUTOR=shell-template (default).",
        };
      }

      const Agent = await loadCursorAgent();
      if (!Agent) {
        return {
          exit_code: 127,
          output:
            "cursor-sdk executor: install optional peer `npm i @cursor/sdk`, or set AGENT_FARM_EXECUTOR=shell-template",
        };
      }

      const modelId = process.env.AGENT_FARM_CURSOR_MODEL?.trim() || "composer-2";
      return runWithCursorSdk(Agent, input, apiKey, modelId);
    },
  };
}
