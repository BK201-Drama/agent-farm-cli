import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { JsonMap } from "../../../domain/task.js";

export async function readJsonl(path: string): Promise<JsonMap[]> {
  try {
    const content = await readFile(path, "utf8");
    return content
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean)
      .map((line: string) => JSON.parse(line) as JsonMap);
  } catch {
    return [];
  }
}

export async function writeJsonl(path: string, rows: JsonMap[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = `${rows.map((x) => JSON.stringify(x)).join("\n")}\n`;
  await writeFile(path, content, "utf8");
}

export async function appendJsonl(path: string, row: JsonMap): Promise<void> {
  const rows = await readJsonl(path);
  rows.push(row);
  await writeJsonl(path, rows);
}
