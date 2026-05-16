import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export type AgentFarmLaunch = {
  command: string;
  argsPrefix: string[];
};

/** Prefer monorepo `dist/` CLI, then node_modules/.bin, then PATH. */
export function resolveAgentFarmLaunch(workspaceRoot: string, configured?: string): AgentFarmLaunch {
  const trimmed = configured?.trim();
  if (trimmed) return { command: trimmed, argsPrefix: [] };
  const distCli = path.join(workspaceRoot, "dist", "interfaces", "cli", "index.js");
  if (fs.existsSync(distCli)) {
    return { command: process.execPath, argsPrefix: [distCli] };
  }
  const bin = process.platform === "win32" ? "agent-farm.cmd" : "agent-farm";
  const local = path.join(workspaceRoot, "node_modules", ".bin", bin);
  if (fs.existsSync(local)) return { command: local, argsPrefix: [] };
  return { command: "agent-farm", argsPrefix: [] };
}

export function resolveAgentFarmCli(workspaceRoot: string, configured?: string): string {
  return resolveAgentFarmLaunch(workspaceRoot, configured).command;
}

export async function pingControlPlane(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/view`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

export class ControlPlaneProcessManager {
  private child: ChildProcess | undefined;
  private startedByUs = false;

  constructor(
    private readonly workspaceRoot: string,
    private readonly port: number,
    private readonly launch: AgentFarmLaunch,
  ) {}

  get apiBase(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async ensureRunning(): Promise<void> {
    if (await pingControlPlane(this.port)) return;
    if (this.child && !this.child.killed) return;
    await this.start();
    for (let i = 0; i < 30; i++) {
      if (await pingControlPlane(this.port)) return;
      await sleep(200);
    }
    throw new Error(`control-plane 未在 ${this.apiBase} 就绪（请检查 agent-farm 是否在 PATH）`);
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [...this.launch.argsPrefix, "control-plane", "serve", "--port", String(this.port)];
      const child = spawn(this.launch.command, args, {
        cwd: this.workspaceRoot,
        env: { ...process.env, AGENT_FARM_STORAGE: process.env.AGENT_FARM_STORAGE ?? "sqlite" },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
      this.child = child;
      this.startedByUs = true;
      child.on("error", reject);
      child.on("spawn", () => resolve());
      setTimeout(() => {
        if (!child.killed) resolve();
      }, 300);
    });
  }

  dispose(): void {
    if (this.startedByUs && this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = undefined;
    this.startedByUs = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
