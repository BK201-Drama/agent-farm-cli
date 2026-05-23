import { readFileSync } from "node:fs";

export interface DynamicWorkersConfig {
  workers: number;
}

export interface ReadDynamicWorkersFileResult {
  workers: number;
  source: "file" | "fallback";
}

const MIN_WORKERS = 1;
const MAX_WORKERS = 64;

export function readDynamicWorkersFile(filePath: string, fallbackWorkers: number): ReadDynamicWorkersFileResult {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content.trim()) as DynamicWorkersConfig;
    if (
      typeof parsed.workers === "number" &&
      Number.isInteger(parsed.workers) &&
      parsed.workers >= MIN_WORKERS &&
      parsed.workers <= MAX_WORKERS
    ) {
      return { workers: parsed.workers, source: "file" };
    }
  } catch {
    // fall through
  }
  return { workers: fallbackWorkers, source: "fallback" };
}

export function createDynamicMaxWorkersGetter(filePath: string, fallbackWorkers: number): () => number {
  return () => readDynamicWorkersFile(filePath, fallbackWorkers).workers;
}
