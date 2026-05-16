import * as vscode from "vscode";
import { QueuePanelProvider } from "./queue-panel.js";
import { FarmStatusBar } from "./status-bar.js";

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new FarmStatusBar();
  statusBar.show();
  const panel = new QueuePanelProvider(context, statusBar);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(QueuePanelProvider.viewType, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("agentFarm.refreshPanel", () => panel.refresh()),
    vscode.commands.registerCommand("agentFarm.startControlPlane", () => panel.startControlPlane()),
    vscode.commands.registerCommand("agentFarm.openFullPanel", () => panel.openFullPanel()),
    vscode.commands.registerCommand("agentFarm.startWorker", () => panel.startWorker()),
    vscode.commands.registerCommand("agentFarm.focusPanel", async () => {
      await vscode.commands.executeCommand("agentFarm.queuePanel.focus");
    }),
    statusBar,
    { dispose: () => panel.disposeManagers() },
  );
}

export function deactivate(): void {
  /* subscriptions dispose */
}
