/**
 * 标准 5 字段 cron 解析器（minute hour day-of-month month day-of-week）
 *
 * 无外部依赖，支持：数字、*、* / step、逗号列表、范围。
 * 不支持：L、W、#、? 等扩展语法。
 */

const FIELD_NAMES = ["minute", "hour", "day-of-month", "month", "day-of-week"] as const;

type CronField = {
  values: number[];
  step: number | null; // */step or 0 if none
};

export type CronExpression = {
  raw: string;
  fields: CronField[];
};

/** 解析单个 cron 字段 */
function parseField(raw: string, min: number, max: number): CronField {
  const trimmed = raw.trim();
  // */step
  if (trimmed.startsWith("*/")) {
    const step = parseInt(trimmed.slice(2), 10);
    if (!Number.isFinite(step) || step < 1) throw new Error(`Invalid step in "${raw}"`);
    return { values: [], step };
  }
  // comma-separated list
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((p) => p.trim());
    const values: number[] = [];
    for (const p of parts) {
      if (p === "*") {
        for (let i = min; i <= max; i++) values.push(i);
      } else if (p.includes("-")) {
        const [lo, hi] = p.split("-").map(Number);
        if (lo === undefined || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) {
          throw new Error(`Invalid range in "${p}"`);
        }
        for (let i = Math.max(lo, min); i <= Math.min(hi, max); i++) values.push(i);
      } else {
        const n = parseInt(p, 10);
        if (!Number.isFinite(n)) throw new Error(`Invalid value in "${p}"`);
        if (n >= min && n <= max) values.push(n);
      }
    }
    return { values: [...new Set(values)].sort((a, b) => a - b), step: null };
  }
  // range (e.g., 1-5)
  if (trimmed.includes("-")) {
    const [lo, hi] = trimmed.split("-").map(Number);
    if (lo === undefined || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      throw new Error(`Invalid range in "${raw}"`);
    }
    const values: number[] = [];
    for (let i = Math.max(lo, min); i <= Math.min(hi, max); i++) values.push(i);
    return { values, step: null };
  }
  // * wildcard
  if (trimmed === "*") return { values: [], step: null };
  // single number
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid cron field "${raw}"`);
  if (n < min || n > max) throw new Error(`Cron field "${raw}" out of range [${min}, ${max}]`);
  return { values: [n], step: null };
}

/** 检查字段值是否匹配给定数字 */
function fieldMatches(field: CronField, value: number): boolean {
  if (field.values.length > 0) return field.values.includes(value);
  if (field.step !== null) return value % field.step === 0;
  return true; // wildcard
}

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day-of-month
  [1, 12], // month
  [0, 6], // day-of-week (0=Sun, 6=Sat)
];

export function parseCron(raw: string): CronExpression {
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${raw}"`);
  }
  const fields: CronField[] = [];
  for (let i = 0; i < 5; i++) {
    const [min, max] = FIELD_RANGES[i]!;
    fields.push(parseField(parts[i]!, min, max));
  }
  return { raw, fields };
}

/** 检查 cron 表达式是否匹配给定时间（UTC） */
export function cronMatchesAt(expr: CronExpression, date: Date): boolean {
  const vals = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1, // JS months are 0-indexed
    date.getUTCDay(),
  ];
  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(expr.fields[i]!, vals[i]!)) return false;
  }
  return true;
}

/** 计算给定时间之后的下一次匹配时间（最多向前搜索 2 年） */
export function nextCronMatch(expr: CronExpression, after: Date): Date | null {
  const maxDate = new Date(after.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  const cursor = new Date(after.getTime() + 60_000); // start next minute
  cursor.setUTCSeconds(0, 0);
  while (cursor <= maxDate) {
    if (cronMatchesAt(expr, cursor)) return new Date(cursor.getTime());
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/** 人类可读的 cron 表达式描述 */
export function describeCron(raw: string): string {
  try {
    const expr = parseCron(raw);
    const [min, hr, dom, mon, dow] = expr.fields;
    const parts: string[] = [];

    if (min && min.values.length === 1) parts.push(`第${min.values[0]}分`);
    else if (min && min.step) parts.push(`每${min.step}分钟`);
    else parts.push("每分钟");

    if (hr && hr.values.length === 1) parts.push(`${hr.values[0]}点`);
    else if (hr && hr.step) parts.push(`每${hr.step}小时`);

    if (dom && dom.values.length === 1) parts.push(`${dom.values[0]}号`);
    if (mon && mon.values.length === 1) parts.push(`${mon.values[0]}月`);

    if (dow && dow.values.length > 0) {
      const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
      parts.push("周" + dow.values.map((d) => dayNames[d]).join(","));
    }

    return parts.join(" ");
  } catch {
    return raw;
  }
}
