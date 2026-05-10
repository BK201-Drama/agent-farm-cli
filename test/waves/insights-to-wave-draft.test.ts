import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const scriptPath = join(repoRoot, "scripts", "insights-to-wave-draft.mjs");

function runScript(jsonFile: string, topN?: number): { stdout: string; stderr: string; status: number | null } {
  const args = [scriptPath, jsonFile];
  if (topN !== undefined) {
    args.push("--top-n", String(topN));
  }
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

describe("scripts/insights-to-wave-draft.mjs", () => {
  it("missing file arg → stderr usage + exit 1", () => {
    const r = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("用法");
  });

  it("file not found → stderr + exit 1", () => {
    const r = runScript("/nonexistent/file.json");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("无法读取文件");
  });

  it("invalid JSON → stderr + exit 1", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "bad.json");
    writeFileSync(p, "not json");
    try {
      const r = runScript(p);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("JSON 解析失败");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("JSON root is array → stderr + exit 1", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "arr.json");
    writeFileSync(p, "[]");
    try {
      const r = runScript(p);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("根须为对象");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("no failure data → empty array + stderr message + exit 0", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "empty.json");
    writeFileSync(p, JSON.stringify({ ok: true, tasks_total: 0 }));
    try {
      const r = runScript(p);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain("无失败数据");
      const out = JSON.parse(r.stdout);
      expect(out).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("from insights failure_top → valid wave array", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "insights.json");
    writeFileSync(
      p,
      JSON.stringify({
        ok: true,
        tasks_total: 10,
        events_total: 30,
        status_counts: { failed: 3, done: 7 },
        failure_top: [
          { error: "npm test failed at auth.spec.ts", count: 3 },
          { error: "ESLint max-len violation", count: 2 },
        ],
        duration_summary: { count: 5, avg_sec: 12.3, p50_sec: 10, p95_sec: 20, max_sec: 30 },
        queue_workspace: { cwd: "/tmp", storage: "jsonl" },
      }),
    );
    try {
      const r = runScript(p);
      expect(r.status).toBe(0);
      expect(r.stderr).toBe("");

      const wave = JSON.parse(r.stdout);
      expect(Array.isArray(wave)).toBe(true);
      expect(wave.length).toBe(2);

      for (const t of wave) {
        expect(t && typeof t === "object").toBe(true);
        const tid = String(t.task_id ?? "").trim();
        expect(tid.length).toBeGreaterThan(0);
        expect(String(t.dedupe_key ?? "").trim()).toBe(tid);
        expect(t.mode).toBe("execute");
        expect(String(t.prompt ?? "").trim().length).toBeGreaterThan(0);
      }

      expect(wave[0].task_id).toMatch(/^draft-\d{8}-\d{2}$/);
      expect(wave[0].prompt).toContain("npm test failed at auth.spec.ts");
      expect(wave[0].prompt).toContain("发生 3 次");
      expect(wave[1].prompt).toContain("ESLint max-len violation");
      expect(wave[1].prompt).toContain("发生 2 次");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("from doctor failure_hotspots → valid wave array", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "doctor.json");
    writeFileSync(
      p,
      JSON.stringify({
        ok: true,
        tasks_total: 5,
        quarantine_total: 0,
        stale_running_count: 0,
        stale_running: [],
        duplicate_dedupe_keys_count: 0,
        duplicate_dedupe_keys: [],
        review_overdue_count: 0,
        review_overdue: [],
        failure_hotspots: [
          { reason: "task_merge_failed: conflict in README.md", count: 4 },
          { reason: "ESM/CJS import mismatch", count: 1 },
        ],
        tasks_with_opencode_heal_prompt: 0,
        heartbeat_missing_count: 0,
        heartbeat_missing: [],
        orphan_worktrees_count: 0,
        orphan_worktrees: [],
        opencode_stream_diag_recent_count: 0,
        opencode_stream_diag_by_stage: {},
        queue_workspace: { cwd: "/tmp", storage: "sqlite" },
      }),
    );
    try {
      const r = runScript(p);
      expect(r.status).toBe(0);

      const wave = JSON.parse(r.stdout);
      expect(Array.isArray(wave)).toBe(true);
      expect(wave.length).toBe(2);

      expect(wave[0].prompt).toContain("task_merge_failed: conflict in README.md");
      expect(wave[0].prompt).toContain("发生 4 次");
      expect(wave[1].prompt).toContain("ESM/CJS import mismatch");
      expect(wave[1].prompt).toContain("发生 1 次");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("--top-n limits output count", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "topn.json");
    writeFileSync(
      p,
      JSON.stringify({
        ok: true,
        failure_top: [
          { error: "E1", count: 5 },
          { error: "E2", count: 4 },
          { error: "E3", count: 3 },
          { error: "E4", count: 2 },
          { error: "E5", count: 1 },
          { error: "E6", count: 1 },
        ],
      }),
    );
    try {
      const r = runScript(p, 3);
      expect(r.status).toBe(0);
      const wave = JSON.parse(r.stdout);
      expect(wave.length).toBe(3);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("prefers failure_top over failure_hotspots when both present", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "both.json");
    writeFileSync(
      p,
      JSON.stringify({
        failure_top: [{ error: "INSIGHTS failure", count: 1 }],
        failure_hotspots: [{ reason: "DOCTOR failure", count: 2 }],
      }),
    );
    try {
      const r = runScript(p);
      expect(r.status).toBe(0);
      const wave = JSON.parse(r.stdout);
      expect(wave.length).toBe(1);
      expect(wave[0].prompt).toContain("INSIGHTS failure");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("failure with zero count works without count hint", () => {
    const tmp = mkdtempSync("test-draft-");
    const p = join(tmp, "zerocount.json");
    writeFileSync(
      p,
      JSON.stringify({
        failure_top: [{ error: "something broke" }],
      }),
    );
    try {
      const r = runScript(p);
      expect(r.status).toBe(0);
      const wave = JSON.parse(r.stdout);
      expect(wave.length).toBe(1);
      expect(wave[0].prompt).not.toContain("发生");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
