/** 比较 x.y.z（可带 v 前缀）；a>b 返回 1，相等 0，a<b 返回 -1。 */
export function compareSemver(a: string, b: string): number {
  const pa = a.trim().replace(/^v/i, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.trim().replace(/^v/i, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}
