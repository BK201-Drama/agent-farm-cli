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
exports.QueuePanelProvider = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const cli_version_js_1 = require("./cli-version.js");
const control_plane_process_js_1 = require("./control-plane-process.js");
const workspace_js_1 = require("./workspace.js");
class QueuePanelProvider {
    context;
    statusBar;
    static viewType = "agentFarm.queuePanel";
    view;
    manager;
    constructor(context, statusBar) {
        this.context = context;
        this.statusBar = statusBar;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        const port = vscode.workspace.getConfiguration("agentFarm").get("port", 18765);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };
        webviewView.webview.html = this.buildHtml(webviewView.webview, port);
        webviewView.onDidChangeVisibility(() => {
            const on = webviewView.visible;
            webviewView.webview.postMessage({ type: "setPolling", enabled: on });
        });
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === "copyText" && typeof msg.text === "string") {
                await vscode.env.clipboard.writeText(msg.text);
                void vscode.window.showInformationMessage("已复制到剪贴板");
                return;
            }
            if (msg?.type === "taskClick" && msg.task_id) {
                const pick = await vscode.window.showQuickPick([
                    { label: "复制 task_id", id: "id" },
                    { label: "复制 prompt", id: "prompt" },
                    { label: "复制 review-approve 命令", id: "cmd" },
                ], { title: String(msg.task_id) });
                if (pick?.id === "id")
                    await vscode.env.clipboard.writeText(String(msg.task_id));
                if (pick?.id === "prompt")
                    await vscode.env.clipboard.writeText(String(msg.prompt || ""));
                if (pick?.id === "cmd") {
                    await vscode.env.clipboard.writeText(`agent-farm queue review-approve --task-id ${msg.task_id}`);
                }
                return;
            }
            if (msg?.type === "view" && msg.health) {
                const h = msg.health;
                this.statusBar.update({
                    running: h.counts?.running ?? 0,
                    stuck: h.counts?.stuck ?? msg.stuck?.items?.length ?? 0,
                    worker_hint: h.worker_hint ?? "unknown",
                });
                return;
            }
            if (msg?.type === "ensureServer" || msg?.type === "refresh") {
                await this.ensureServer(port);
                if (msg?.type === "refresh") {
                    webviewView.webview.postMessage({ type: "reload" });
                }
            }
        });
        void this.bootstrap(port);
    }
    async refresh() {
        const port = vscode.workspace.getConfiguration("agentFarm").get("port", 18765);
        await this.ensureServer(port);
        this.view?.webview.postMessage({ type: "reload" });
    }
    async startControlPlane() {
        const port = vscode.workspace.getConfiguration("agentFarm").get("port", 18765);
        const health = await this.ensureServer(port);
        void vscode.window.showInformationMessage(`control-plane ${health.version ?? ""} @ ${health.queue_cwd ?? ""}`);
    }
    openFullPanel() {
        const port = vscode.workspace.getConfiguration("agentFarm").get("port", 18765);
        void vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}/`));
    }
    startWorker() {
        const root = (0, workspace_js_1.resolveAgentFarmWorkspaceRoot)();
        if (!root) {
            void vscode.window.showWarningMessage("请先打开 agent-farm 项目文件夹");
            return;
        }
        const term = vscode.window.createTerminal({ cwd: root, name: "agent-farm worker" });
        term.show();
        const launch = (0, control_plane_process_js_1.resolveAgentFarmLaunch)(root, vscode.workspace.getConfiguration("agentFarm").get("cliPath"));
        const parts = [launch.command, ...launch.argsPrefix, "worker"].map((a) => a.includes(" ") ? `"${a}"` : a);
        term.sendText(parts.join(" "), true);
    }
    disposeManagers() {
        this.manager?.dispose();
        this.manager = undefined;
    }
    async bootstrap(port) {
        const auto = vscode.workspace.getConfiguration("agentFarm").get("autoStartServer", true);
        if (!auto)
            return;
        try {
            await this.ensureServer(port);
            this.view?.webview.postMessage({ type: "reload" });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            void vscode.window.showWarningMessage(`Agent Farm: ${msg}`);
        }
    }
    async ensureServer(port) {
        const root = (0, workspace_js_1.resolveAgentFarmWorkspaceRoot)();
        if (!root) {
            throw new Error("请先打开含 .agent-farm 的项目文件夹");
        }
        const cfg = vscode.workspace.getConfiguration("agentFarm");
        const launch = (0, control_plane_process_js_1.resolveAgentFarmLaunch)(root, cfg.get("cliPath"));
        const ver = await (0, cli_version_js_1.readAgentFarmCliVersion)(launch);
        const warn = (0, cli_version_js_1.warnIfCliVersionMismatch)(ver);
        if (warn)
            void vscode.window.showWarningMessage(warn);
        if (!this.manager || this.manager.apiBase !== `http://127.0.0.1:${port}`) {
            this.manager?.dispose();
            this.manager = new control_plane_process_js_1.ControlPlaneProcessManager(root, port, launch);
        }
        return this.manager.ensureRunning();
    }
    buildHtml(webview, port) {
        const templatePath = path.join(this.context.extensionPath, "media", "panel.html");
        let html = fs.readFileSync(templatePath, "utf8");
        const apiBase = `http://127.0.0.1:${port}`;
        const coreUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "panel-core.js"));
        const csp = webview.cspSource;
        html = html
            .replaceAll("__API_BASE__", apiBase)
            .replaceAll("__CSP__", csp)
            .replaceAll("__PANEL_CORE_URI__", coreUri.toString());
        return html;
    }
}
exports.QueuePanelProvider = QueuePanelProvider;
//# sourceMappingURL=queue-panel.js.map