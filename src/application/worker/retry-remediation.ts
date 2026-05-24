import type { AgentStreamObserver } from "../../infrastructure/executors/opencode-shell-runner.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";

export type RemediationAction = { type: "npm_install"; reason: string };

const DEP_PATTERNS = /npm|module not found|cannot find module/i;
const RATE_LIMIT_PATTERNS = /429|rate.?limit|quota|throttl/i;

export function detectRemediations(
  streamObs: AgentStreamObserver | undefined,
  execOut: string,
): RemediationAction[] {
  const actions: RemediationAction[] = [];
  const combined = [
    ...(streamObs ? streamObs.snapshot().errorSnippets : []),
    ...(streamObs ? streamObs.snapshot().toolIssues : []),
  ].join(" ");
  const scan = (combined + " " + execOut.slice(0, 2000)).toLowerCase();

  if (DEP_PATTERNS.test(scan)) {
    actions.push({ type: "npm_install", reason: "dependency/module-not-found errors detected" });
  }

  return actions;
}

const NPM_INSTALL_TIMEOUT_MS = 60_000;

export async function runRemediation(
  action: RemediationAction,
  opts: { cwd: string; env: NodeJS.ProcessEnv; runShell: ShellRunner },
): Promise<{ ok: boolean; output: string }> {
  if (action.type !== "npm_install") {
    return { ok: false, output: `unknown remediation type: ${action.type}` };
  }

  const cmd = `cd "${opts.cwd}" && npm install --no-audit --no-fund --loglevel=error`;
  const result = await opts.runShell(cmd, {
    env: opts.env,
    timeoutMs: NPM_INSTALL_TIMEOUT_MS,
  });

  return { ok: result.exitCode === 0, output: result.output };
}

export function detectRateLimit(
  streamObs: AgentStreamObserver | undefined,
  execOut: string,
): boolean {
  const combined = [
    ...(streamObs ? streamObs.snapshot().errorSnippets : []),
    ...(streamObs ? streamObs.snapshot().toolIssues : []),
    execOut.slice(0, 2000),
  ].join(" ");
  return RATE_LIMIT_PATTERNS.test(combined);
}

export function rateLimitConcurrencyWarningMsg(): string {
  const reduction = process.env.AGENT_FARM_RATE_LIMIT_CONCURRENCY_REDUCTION;
  if (reduction) {
    return `[agent-farm] rate-limit detected; consider reducing concurrency by ${reduction} (AGENT_FARM_RATE_LIMIT_CONCURRENCY_REDUCTION)`;
  }
  return "[agent-farm] rate-limit detected; consider reducing worker concurrency or increasing retry delay";
}
