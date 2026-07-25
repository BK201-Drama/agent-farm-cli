/** 上下文指纹 — 用于历史决策相似度搜索 */

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "not", "no", "nor", "so", "if", "then", "than", "that", "this",
  "these", "those", "it", "its", "we", "you", "they", "he", "she",
  "which", "who", "whom", "what", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other",
  "some", "such", "only", "own", "same", "too", "very", "just",
  "about", "also", "here", "there", "need", "use", "using", "used",
  "like", "want", "make", "get",
]);

/**
 * 将 context + options 转为归一化 token 数组。
 * 确定性输出 — 相同输入始终产生相同结果。
 */
export function fingerprintContext(context: string, options: string[]): string[] {
  const text = `${context} ${options.join(" ")}`.toLowerCase();
  return text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .filter((t) => !STOP_WORDS.has(t))
    .sort();
}

/**
 * Jaccard 相似度: |A ∩ B| / |A ∪ B|
 * 返回值 ∈ [0, 1]。完全不相交 = 0；完全一致 = 1。
 */
export function fingerprintSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/** 便捷：将 token 数组序列化为空格分隔字符串（用于持久化） */
export function fingerprintToString(tokens: string[]): string {
  return tokens.join(" ");
}

/** 便捷：从持久化字符串恢复 token 数组 */
export function fingerprintFromString(s: string): string[] {
  return s.split(" ").filter(Boolean);
}
