/**
 * M4+ 模型定价：硬编码默认价格表 + AGENT_FARM_MODEL_PRICES 环境变量覆盖。
 * 价格为每百万 token 的 USD 价格。
 */

export type ModelPrice = {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
};

/** 默认模型价格表（每百万 token USD）。来源：各模型官方定价页，2025–2026。 */
const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  // Anthropic Claude
  "claude-opus-4-8": { input: 15, output: 75 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-opus-4": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-haiku-4": { input: 0.8, output: 4 },
  "claude-fable-5": { input: 3, output: 15 },
  // OpenAI GPT
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "o3": { input: 10, output: 40 },
  // DeepSeek
  "deepseek-v4": { input: 0.27, output: 1.1 },
  "deepseek-v3": { input: 0.27, output: 1.1 },
  "deepseek-r1": { input: 0.55, output: 2.19 },
};

/** 默认 fallback（未知模型用此价格，即 0 = 免费/未定价）。 */
const DEFAULT_ZERO_PRICE: ModelPrice = { input: 0, output: 0 };

let _envOverride: Record<string, ModelPrice> | null | undefined;

function loadEnvOverride(): Record<string, ModelPrice> | null {
  if (_envOverride !== undefined) return _envOverride;
  const raw = (process.env.AGENT_FARM_MODEL_PRICES ?? "").trim();
  if (!raw) {
    _envOverride = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      _envOverride = parsed as Record<string, ModelPrice>;
      return _envOverride;
    }
  } catch {
    console.error("[agent-farm] failed to parse AGENT_FARM_MODEL_PRICES, using defaults");
  }
  _envOverride = null;
  return null;
}

/**
 * 解析模型价格。优先级：AGENT_FARM_MODEL_PRICES env → hardcoded table → zero.
 * Env 格式：'{"model":{"input":15,"output":75}}'
 */
export function resolveModelPrice(model: string): ModelPrice {
  const env = loadEnvOverride();
  if (env?.[model]) return env[model];

  // Try exact match first, then prefix match (e.g. "claude-opus-4-8-20251001" → "claude-opus-4-8")
  if (DEFAULT_MODEL_PRICES[model]) return DEFAULT_MODEL_PRICES[model]!;

  for (const [key, price] of Object.entries(DEFAULT_MODEL_PRICES)) {
    if (model.startsWith(key)) return price;
  }

  return DEFAULT_ZERO_PRICE;
}

/**
 * Compute cost in USD cents given token counts and price per 1M tokens.
 * Returns integer cents (rounded).
 */
export function computeCostCents(inputTokens: number, outputTokens: number, price: ModelPrice): number {
  const cost =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;
  return Math.round(cost * 100);
}

/** Format cents as human-readable USD string (e.g. "$0.042" or "$1.23"). */
export function formatCostCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 0.01) return "<$0.01";
  if (dollars < 10) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}
