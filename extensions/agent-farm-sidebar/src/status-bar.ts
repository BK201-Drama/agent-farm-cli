import * as vscode from "vscode";

export type FarmStatusSnapshot = {
  running: number;
  stuck: number;
  worker_hint: string;
};

export class FarmStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "agentFarm.focusPanel";
    this.item.tooltip = "Agent Farm 队列（点击打开侧栏）";
  }

  show(): void {
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  update(s: FarmStatusSnapshot | undefined): void {
    if (!s) {
      this.item.text = "$(server) Agent Farm";
      return;
    }
    const warn = s.stuck > 0 ? ` $(warning) stuck ${s.stuck}` : "";
    const run = s.running > 0 ? ` $(play) ${s.running}` : "";
    this.item.text = `$(server) Farm${run}${warn}`;
    this.item.tooltip = `worker: ${s.worker_hint} · 点击打开侧栏`;
  }
}
