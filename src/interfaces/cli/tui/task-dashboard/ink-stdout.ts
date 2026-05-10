/**
 * Ink 5：当 `outputHeight < stdout.rows` 时用 `log-update` 做增量刷新；在 Windows、Git Bash、部分 IDE 集成终端里
 * `stdout.rows` 与真实可视区不一致时，会导致整屏错位并不断向滚动区堆叠重复画面。
 * 将传给 Ink 的 `rows` 压到极小可强制走 `clearTerminal` 全屏重绘（见 `ink` 包 `ink.js` `onRender`）。
 */
export function shouldForceInkFullTerminalRedraw(): boolean {
  const v = process.env.AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR;
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return process.platform === "win32";
}

/** 供 `render()` 使用：布局高度仍由组件内 `useTaskPoll` 读取的真实 `process.stdout.rows` 决定，仅改变 Ink 内部分支判断。 */
export function wrapStdoutForInkFullRedraw(base: NodeJS.WriteStream): NodeJS.WriteStream {
  if (!shouldForceInkFullTerminalRedraw()) return base;
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "rows") return 1;
      return Reflect.get(target, prop, receiver) as unknown;
    },
  }) as NodeJS.WriteStream;
}
