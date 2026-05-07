export function padCell(s: string, w: number): string {
  const t = s.slice(0, w);
  return t.length >= w ? t : `${t}${" ".repeat(w - t.length)}`;
}

export function dimRule(len: number): string {
  const n = Math.min(Math.max(8, len), 200);
  return "─".repeat(n);
}

export function statusCell(status: string, width: number): string {
  return padCell(status.slice(0, width), width);
}
