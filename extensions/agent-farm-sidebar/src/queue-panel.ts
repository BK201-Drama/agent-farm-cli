import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  ControlPlaneProcessManager,
  resolveAgentFarmLaunch,
} from "./control-plane-process.js";

export class QueuePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "agentFarm.queuePanel";

  private view?: vscode.WebviewView;
  private manager?: ControlPlaneProcessManager;

  constructor(private readonly context: vscode.ExtensionContext) {}

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

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "copyText" && typeof msg.text === "string") {
        await vscode.env.clipboard.writeText(msg.text);
        void vscode.window.showInformationMessage("已复制命令到剪贴板");
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
    await this.ensureServer(port);
    void vscode.window.showInformationMessage(`Agent Farm control-plane: http://127.0.0.1:${port}/`);
  }

  openFullPanel(): void {
    const port = vscode.workspace.getConfiguration("agentFarm").get<number>("port", 18765);
    void vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}/`));
  }

  startWorker(): void {
    const root = this.workspaceRoot();
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

  private workspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
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

  private async ensureServer(port: number): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      throw new Error("请先打开 agent-farm 项目文件夹");
    }
    const cfg = vscode.workspace.getConfiguration("agentFarm");
    const launch = resolveAgentFarmLaunch(root, cfg.get<string>("cliPath"));
    if (!this.manager || this.manager.apiBase !== `http://127.0.0.1:${port}`) {
      this.manager?.dispose();
      this.manager = new ControlPlaneProcessManager(root, port, launch);
    }
    await this.manager.ensureRunning();
  }

  private buildHtml(webview: vscode.Webview, port: number): string {
    const templatePath = path.join(this.context.extensionPath, "media", "panel.html");
    let html = fs.readFileSync(templatePath, "utf8");
    const apiBase = `http://127.0.0.1:${port}`;
    const csp = webview.cspSource;
    html = html
      .replaceAll("__API_BASE__", apiBase)
      .replaceAll("__CSP__", csp);
    return html;
  }
}
