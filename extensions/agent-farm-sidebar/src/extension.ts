import * as vscode from "vscode";
import { QueuePanelProvider } from "./queue-panel.js";

export function activate(context: vscode.ExtensionContext): void {
  const panel = new QueuePanelProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(QueuePanelProvider.viewType, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("agentFarm.refreshPanel", () => panel.refresh()),
    vscode.commands.registerCommand("agentFarm.startControlPlane", () => panel.startControlPlane()),
    vscode.commands.registerCommand("agentFarm.openFullPanel", () => panel.openFullPanel()),
    vscode.commands.registerCommand("agentFarm.startWorker", () => panel.startWorker()),
    { dispose: () => panel.disposeManagers() },
  );
}

export function deactivate(): void {
  // dispose via subscription
}
