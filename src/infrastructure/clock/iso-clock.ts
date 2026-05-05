import type { IsoClock } from "../../domain/ports/clock.js";

export function nowIso(): string {
  return new Date().toISOString();
}

/** 系统 UTC ISO 时间，供组合根、worker、持久化层共用（与 JSONL 读写解耦） */
export const systemIsoClock: IsoClock = nowIso;
