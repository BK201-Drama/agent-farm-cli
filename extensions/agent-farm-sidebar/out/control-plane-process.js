"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPlaneProcessManager = void 0;
exports.resolveAgentFarmLaunch = resolveAgentFarmLaunch;
exports.resolveAgentFarmCli = resolveAgentFarmCli;
exports.pingControlPlane = pingControlPlane;
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
/** Prefer monorepo `dist/` CLI, then node_modules/.bin, then PATH. */
function resolveAgentFarmLaunch(workspaceRoot, configured) {
    const trimmed = configured?.trim();
    if (trimmed)
        return { command: trimmed, argsPrefix: [] };
    const distCli = path.join(workspaceRoot, "dist", "interfaces", "cli", "index.js");
    if (fs.existsSync(distCli)) {
        return { command: process.execPath, argsPrefix: [distCli] };
    }
    const bin = process.platform === "win32" ? "agent-farm.cmd" : "agent-farm";
    const local = path.join(workspaceRoot, "node_modules", ".bin", bin);
    if (fs.existsSync(local))
        return { command: local, argsPrefix: [] };
    return { command: "agent-farm", argsPrefix: [] };
}
function resolveAgentFarmCli(workspaceRoot, configured) {
    return resolveAgentFarmLaunch(workspaceRoot, configured).command;
}
async function pingControlPlane(port) {
    try {
        const r = await fetch(`http://127.0.0.1:${port}/api/view`, { signal: AbortSignal.timeout(2000) });
        return r.ok;
    }
    catch {
        return false;
    }
}
class ControlPlaneProcessManager {
    workspaceRoot;
    port;
    launch;
    child;
    startedByUs = false;
    constructor(workspaceRoot, port, launch) {
        this.workspaceRoot = workspaceRoot;
        this.port = port;
        this.launch = launch;
    }
    get apiBase() {
        return `http://127.0.0.1:${this.port}`;
    }
    async ensureRunning() {
        if (await pingControlPlane(this.port))
            return;
        if (this.child && !this.child.killed)
            return;
        await this.start();
        for (let i = 0; i < 30; i++) {
            if (await pingControlPlane(this.port))
                return;
            await sleep(200);
        }
        throw new Error(`control-plane 未在 ${this.apiBase} 就绪（请检查 agent-farm 是否在 PATH）`);
    }
    start() {
        return new Promise((resolve, reject) => {
            const args = [...this.launch.argsPrefix, "control-plane", "serve", "--port", String(this.port)];
            const child = (0, node_child_process_1.spawn)(this.launch.command, args, {
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
                if (!child.killed)
                    resolve();
            }, 300);
        });
    }
    dispose() {
        if (this.startedByUs && this.child && !this.child.killed) {
            this.child.kill();
        }
        this.child = undefined;
        this.startedByUs = false;
    }
}
exports.ControlPlaneProcessManager = ControlPlaneProcessManager;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=control-plane-process.js.map