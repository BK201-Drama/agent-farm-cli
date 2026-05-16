import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { readAgentFarmCliVersion, warnIfCliVersionMismatch } from "./cli-version.js";
import {
  ControlPlaneProcessManager,
  resolveAgentFarmLaunch,
} from "./control-plane-process.js";
import type { FarmStatusBar } from "./status-bar.js";
import { resolveAgentFarmWorkspaceRoot } from "./workspace.js";

export class QueuePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "agentFarm.queuePanel";

  private view?: vscode.WebviewView;
  private manager?: ControlPlaneProcessManager;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusBar: FarmStatusBar,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    const port = vscode.workspace.getConfiguration("agentFarm").get<number>("port", 18765);
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
        const pick = await vscode.window.showQuickPick(
          [
            { label: "复制 task_id", id: "id" },
            { label: "复制 prompt", id: "prompt" },
            { label: "复制 review-approve 命令", id: "cmd" },
          ],
          { title: String(msg.task_id) },
        );
        if (pick?.id === "id") await vscode.env.clipboard.writeText(String(msg.task_id));
        if (pick?.id === "prompt") await vscode.env.clipboard.writeText(String(msg.prompt || ""));
        if (pick?.id === "cmd") {
          await vscode.env.clipboard.writeText(
            `agent-farm queue review-approve --task-id ${msg.task_id}`,
          );
        }
        return;
      }
      if (msg?.type === "view" && msg.health) {
        const h = msg.health as { counts?: { running?: number; stuck?: number }; worker_hint?: string };
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

  async refresh(): Promise<void> {
    const port = vscode.workspace.getConfiguration("agentFarm").get<number>("port", 18765);
    await this.ensureServer(port);
    this.view?.webview.postMessage({ type: "reload" });
  }

  async startControlPlane(): Promise<void> {
    const port = vscode.workspace.getConfiguration("agentFarm").get<number>("port", 18765);
    const health = await this.ensureServer(port);
    void vscode.window.showInformationMessage(
      `control-plane ${health.version ?? ""} @ ${health.queue_cwd ?? ""}`,
    );
  }

  openFullPanel(): void {
    const port = vscode.workspace.getConfiguration("agentFarm").get<number>("port", 18765);
    void vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}/`));
  }

  startWorker(): void {
    const root = resolveAgentFarmWorkspaceRoot();
    if (!root) {
      void vscode.window.showWarningMessage("请先打开 agent-farm 项目文件夹");
      return;
    }
    const term = vscode.window.createTerminal({ cwd: root, name: "agent-farm worker" });
    term.show();
    const launch = resolveAgentFarmLaunch(root, vscode.workspace.getConfiguration("agentFarm").get<string>("cliPath"));
    const parts = [launch.command, ...launch.argsPrefix, "worker"].map((a) =>
      a.includes(" ") ? `"${a}"` : a,
    );
    term.sendText(parts.join(" "), true);
  }

  disposeManagers(): void {
    this.manager?.dispose();
    this.manager = undefined;
  }

  private async bootstrap(port: number): Promise<void> {
    const auto = vscode.workspace.getConfiguration("agentFarm").get<boolean>("autoStartServer", true);
    if (!auto) return;
    try {
      await this.ensureServer(port);
      this.view?.webview.postMessage({ type: "reload" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void vscode.window.showWarningMessage(`Agent Farm: ${msg}`);
    }
  }

  private async ensureServer(port: number): Promise<{ version?: string; queue_cwd?: string }> {
    const root = resolveAgentFarmWorkspaceRoot();
    if (!root) {
      throw new Error("请先打开含 .agent-farm 的项目文件夹");
    }
    const cfg = vscode.workspace.getConfiguration("agentFarm");
    const launch = resolveAgentFarmLaunch(root, cfg.get<string>("cliPath"));
    const ver = await readAgentFarmCliVersion(launch);
    const warn = warnIfCliVersionMismatch(ver);
    if (warn) void vscode.window.showWarningMessage(warn);

    if (!this.manager || this.manager.apiBase !== `http://127.0.0.1:${port}`) {
      this.manager?.dispose();
      this.manager = new ControlPlaneProcessManager(root, port, launch);
    }
    return this.manager.ensureRunning();
  }

  private buildHtml(webview: vscode.Webview, port: number): string {
    const templatePath = path.join(this.context.extensionPath, "media", "panel.html");
    let html = fs.readFileSync(templatePath, "utf8");
    const apiBase = `http://127.0.0.1:${port}`;
    const coreUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "panel-core.js"),
    );
    const csp = webview.cspSource;
    html = html
      .replaceAll("__API_BASE__", apiBase)
      .replaceAll("__CSP__", csp)
      .replaceAll("__PANEL_CORE_URI__", coreUri.toString());
    return html;
  }
}
