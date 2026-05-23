export function clampViewport(
  cursor: number,
  scroll: number,
  len: number,
  view: number,
): { cursor: number; scroll: number } {
  if (len <= 0) return { cursor: 0, scroll: 0 };
  const c = Math.max(0, Math.min(len - 1, cursor));
  let s = Math.max(0, Math.min(scroll, Math.max(0, len - view)));
  if (c < s) s = c;
  if (c >= s + view) s = c - view + 1;
  s = Math.max(0, Math.min(s, Math.max(0, len - view)));
  return { cursor: c, scroll: s };
}
