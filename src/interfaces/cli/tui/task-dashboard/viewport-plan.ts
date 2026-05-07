/** 默认视口（终端行数未知或足够大时使用） */
export const DEFAULT_VIEWPORT_PIPE = 20;
export const DEFAULT_VIEWPORT_HIST = 26;

export type DashboardViewportInput = {
  /** process.stdout.rows，TTY 下由轮询 hook 更新 */
  terminalRows: number;
  storageLineCount: number;
  hasStatusCompact: boolean;
  hasLastOk: boolean;
  showStdinHint: boolean;
  hasLoadError: boolean;
  /** OpenCode 摘要面板内可见行数（0=关闭该面板） */
  opencodeFeedLines?: number;
};

/**
 * 按终端高度分配 pipeline / history 列表可视行数，避免 Ink 总高度超过可视区导致错位与「反复打印」。
 * 估算偏保守：略多缩列表、少溢出。
 */
export function computeDashboardViewports(input: DashboardViewportInput): {
  pipe: number;
  hist: number;
} {
  const r = input.terminalRows;
  if (!Number.isFinite(r) || r < 10) {
    return { pipe: DEFAULT_VIEWPORT_PIPE, hist: DEFAULT_VIEWPORT_HIST };
  }

  const tight = r < 34;
  const headerBase = tight ? 3 : 4;
  const headerLines =
    headerBase +
    input.storageLineCount +
    (input.hasStatusCompact ? 1 : 0) +
    (input.hasLastOk ? 1 : 0);

  const footerLines = 2 + (input.showStdinHint ? 2 : 0);
  const errLines = input.hasLoadError ? 4 : 0;

  // round border 区块：标题 + 分隔 + 表头 + 边框；矮终端用更小估值以免「列表预算」被扣成负仍强行默认大视口
  const sectionFrame = r < 26 ? 3 : tight ? 4 : 6;
  const betweenSections = 1;
  const safety = tight ? 2 : 4;

  const feedLines = input.opencodeFeedLines ?? 0;
  const opencodeChrome =
    feedLines > 0 ? betweenSections + sectionFrame + feedLines : 0;
  const chrome =
    headerLines +
    footerLines +
    errLines +
    sectionFrame * 2 +
    betweenSections +
    opencodeChrome +
    safety;

  const MIN_P = 2;
  const MIN_H = 2;
  let listBudget = Math.floor(r - chrome);
  if (listBudget < MIN_P + MIN_H) {
    listBudget = MIN_P + MIN_H;
  }

  const pipe = Math.max(
    MIN_P,
    Math.min(DEFAULT_VIEWPORT_PIPE, Math.floor(listBudget * 0.42)),
  );
  const hist = Math.max(
    MIN_H,
    Math.min(DEFAULT_VIEWPORT_HIST, listBudget - pipe),
  );
  return { pipe, hist };
}
