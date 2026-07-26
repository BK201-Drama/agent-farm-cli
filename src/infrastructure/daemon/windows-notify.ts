import { spawn } from "node:child_process";

export async function sendWindowsToast(title: string, body: string): Promise<void> {
  if (process.platform !== "win32") return;

  const escapedTitle = title.replace(/'/g, "''");
  const escapedBody = body.replace(/'/g, "''");

  const psScript = [
    `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]`,
    `$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]`,
    `$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)`,
    `$textNodes = $template.GetElementsByTagName('text')`,
    `$textNodes.Item(0).AppendChild($template.CreateTextNode('${escapedTitle}'))`,
    `$textNodes.Item(1).AppendChild($template.CreateTextNode('${escapedBody}'))`,
    `$toast = [Windows.UI.Notifications.ToastNotification]::new($template)`,
    `$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('agent-farm-cli')`,
    `$notifier.Show($toast)`,
  ].join("; ");

  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

export type NotifyEvent = {
  type: "done" | "failed" | "stuck" | "idle";
  taskId: string;
  detail?: string;
};

export function createNotifyThrottle(windowMs: number = 5 * 60 * 1000) {
  const recent = new Map<string, number>(); // key = "taskId::type", value = timestamp

  const throttledNotify = async (event: NotifyEvent): Promise<void> => {
    const key = `${event.taskId}::${event.type}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < windowMs) return;
    recent.set(key, now);

    // Prevent unbounded growth
    if (recent.size > 200) {
      const cutoff = now - windowMs;
      for (const [k, ts] of recent) {
        if (ts < cutoff) recent.delete(k);
      }
    }

    const titleMap: Record<NotifyEvent["type"], string> = {
      done: "Task Done",
      failed: "Task Failed",
      stuck: "Task Stuck",
      idle: "Daemon Idle",
    };

    const title = titleMap[event.type];
    const body = event.detail
      ? `${event.taskId.slice(0, 8)}... — ${event.detail.slice(0, 80)}`
      : `${event.taskId.slice(0, 8)}...`;

    await sendWindowsToast(title, body);
  };

  return throttledNotify;
}
