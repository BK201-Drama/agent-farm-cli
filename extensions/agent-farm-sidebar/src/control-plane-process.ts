import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { healthMatchesWorkspace } from "./workspace.js";

export type AgentFarmLaunch = {
  command: string;
  argsPrefix: string[];
};

/** Windows: shell:true breaks `node "C:\Program Files\...\node.exe" script.js` and hides --version stdout. */
export function shouldUseShellForSpawn(launch: AgentFarmLaunch): boolean {
  if (process.platform !== "win32") return false;
  if (launch.argsPrefix.length > 0) return false;
  if (launch.command.includes(" ")) return false;
  if (/\.(cmd|bat)$/i.test(launch.command)) return false;
  return true;
}

export type ControlPlaneHealthResponse = {
  service?: string;
  version?: string;
  queue_cwd?: string;
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

async function fetchHealth(port: number): Promise<ControlPlaneHealthResponse | undefined> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return undefined;
    return (await r.json()) as ControlPlaneHealthResponse;
  } catch {
    return undefined;
  }
}

export async function pingControlPlane(
  port: number,
  workspaceRoot?: string,
): Promise<{ ok: boolean; health?: ControlPlaneHealthResponse }> {
  const health = await fetchHealth(port);
  if (!health || health.service !== "agent-farm-control-plane") {
    return { ok: false };
  }
  if (workspaceRoot && health.queue_cwd && !healthMatchesWorkspace(health.queue_cwd, workspaceRoot)) {
    return {
      ok: false,
      health,
    };
  }
  return { ok: true, health };
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

  async ensureRunning(): Promise<ControlPlaneHealthResponse> {
    const existing = await pingControlPlane(this.port, this.workspaceRoot);
    if (existing.ok && existing.health) return existing.health;
    if (existing.health?.queue_cwd) {
      throw new Error(
        `端口 ${this.port} 已被其它项目占用（${existing.health.queue_cwd}），请改 agentFarm.port 或关闭该进程`,
      );
    }
    if (this.child && !this.child.killed) {
      /* wait */
    } else {
      await this.start();
    }
    for (let i = 0; i < 30; i++) {
      const again = await pingControlPlane(this.port, this.workspaceRoot);
      if (again.ok && again.health) return again.health;
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
        shell: shouldUseShellForSpawn(this.launch),
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
