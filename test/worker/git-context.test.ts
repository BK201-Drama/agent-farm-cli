import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectGitTemplateFields, runGitCapture } from "../../src/application/worker/git-context.js";
import { GIT_DIFF_CAP, GIT_DIFF_NAME_STATUS_CAP } from "../../src/application/worker/worker-output-limits.js";

const spawnSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawnSync: (...args: any[]) => spawnSyncMock(...args),
}));

function setGitResponse(argsPattern: string, status: number, stdout: string) {
  spawnSyncMock.mockImplementation((_cmd: string, args: string[], _opts?: any) => {
    const key = args.join(" ");
    if (key.includes(argsPattern)) {
      return { status, stdout, stderr: status !== 0 ? "error" : "" };
    }
    return { status: 1, stdout: "", stderr: "unmatched" };
  });
}

function setGitResponses(responses: Array<{ argsPattern: string; status: number; stdout: string }>) {
  spawnSyncMock.mockImplementation((_cmd: string, args: string[], _opts?: any) => {
    const key = args.join(" ");
    for (const r of responses) {
      if (key.includes(r.argsPattern)) {
        return { status: r.status, stdout: r.stdout, stderr: r.status !== 0 ? "error" : "" };
      }
    }
    return { status: 1, stdout: "", stderr: "unmatched" };
  });
}

describe("runGitCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with stdout on success", () => {
    setGitResponse("diff", 0, "hello\n");
    const r = runGitCapture("/repo", ["diff", "HEAD~1"]);
    expect(r).toEqual({ ok: true, stdout: "hello\n" });
  });

  it("returns not ok on non-zero exit", () => {
    setGitResponse("diff", 1, "");
    const r = runGitCapture("/repo", ["diff", "HEAD~1"]);
    expect(r).toEqual({ ok: false });
  });
});

describe("collectGitTemplateFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty strings when all git commands fail", () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: "", stderr: "not a git repository" });
    const fields = collectGitTemplateFields("/not-git");
    expect(fields.git_diff).toBe("");
    expect(fields.git_diff_name_status).toBe("");
  });

  it("falls back to HEAD~1 when default branch resolution fails", () => {
    setGitResponses([
      { argsPattern: "symbolic-ref", status: 1, stdout: "" },
      { argsPattern: "diff HEAD~1", status: 0, stdout: "diff output" },
      { argsPattern: "diff --name-status HEAD~1", status: 0, stdout: "M\tfoo.ts" },
    ]);
    const fields = collectGitTemplateFields("/repo");
    expect(fields.git_diff).toBe("diff output");
    expect(fields.git_diff_name_status).toBe("M\tfoo.ts");
  });

  it("uses default branch ref when available", () => {
    setGitResponses([
      { argsPattern: "symbolic-ref", status: 0, stdout: "refs/remotes/origin/main" },
      { argsPattern: "diff refs/remotes/origin/main...HEAD", status: 0, stdout: "remote diff" },
      { argsPattern: "diff --name-status refs/remotes/origin/main...HEAD", status: 0, stdout: "A\tbar.ts" },
    ]);
    const fields = collectGitTemplateFields("/repo");
    expect(fields.git_diff).toBe("remote diff");
    expect(fields.git_diff_name_status).toBe("A\tbar.ts");
  });

  it("falls back to HEAD~1 when remote diff fails but default branch resolved", () => {
    setGitResponses([
      { argsPattern: "symbolic-ref", status: 0, stdout: "refs/remotes/origin/main" },
      { argsPattern: "refs/remotes/origin/main...HEAD", status: 1, stdout: "" },
      { argsPattern: "diff HEAD~1", status: 0, stdout: "fallback diff" },
      { argsPattern: "diff --name-status HEAD~1", status: 0, stdout: "D\told.ts" },
    ]);
    const fields = collectGitTemplateFields("/repo");
    expect(fields.git_diff).toBe("fallback diff");
    expect(fields.git_diff_name_status).toBe("D\told.ts");
  });
});

describe("git diff truncation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("truncates diff output exceeding GIT_DIFF_CAP", () => {
    const longLine = "a".repeat(200);
    const hugeOutput = Array.from({ length: 600 }, () => longLine).join("\n");

    setGitResponses([
      { argsPattern: "symbolic-ref", status: 1, stdout: "" },
      { argsPattern: "diff HEAD~1", status: 0, stdout: hugeOutput },
      { argsPattern: "diff --name-status HEAD~1", status: 0, stdout: "M\tf.ts" },
    ]);
    const fields = collectGitTemplateFields("/repo");
    expect(fields.git_diff.length).toBeLessThanOrEqual(GIT_DIFF_CAP);
    expect(fields.git_diff).toContain("[... truncated ...]");
    expect(fields.git_diff_name_status).toBe("M\tf.ts");
  });

  it("truncates name-status output exceeding GIT_DIFF_NAME_STATUS_CAP", () => {
    const longLine = "A\t" + "x".repeat(200);
    const hugeOutput = Array.from({ length: 500 }, () => longLine).join("\n");

    setGitResponses([
      { argsPattern: "symbolic-ref", status: 1, stdout: "" },
      { argsPattern: "diff HEAD~1", status: 0, stdout: "small" },
      { argsPattern: "diff --name-status HEAD~1", status: 0, stdout: hugeOutput },
    ]);
    const fields = collectGitTemplateFields("/repo");
    expect(fields.git_diff_name_status.length).toBeLessThanOrEqual(GIT_DIFF_NAME_STATUS_CAP);
    expect(fields.git_diff_name_status).toContain("[... truncated ...]");
  });

  it("does not truncate when output is under cap", () => {
    setGitResponses([
      { argsPattern: "symbolic-ref", status: 1, stdout: "" },
      { argsPattern: "diff HEAD~1", status: 0, stdout: "tiny diff" },
      { argsPattern: "diff --name-status HEAD~1", status: 0, stdout: "M\tx.ts" },
    ]);
    const fields = collectGitTemplateFields("/repo");
    expect(fields.git_diff).toBe("tiny diff");
    expect(fields.git_diff_name_status).toBe("M\tx.ts");
  });

  it("preserves exact-cap output without marker", () => {
    const exact = "a".repeat(GIT_DIFF_CAP);
    setGitResponses([
      { argsPattern: "symbolic-ref", status: 1, stdout: "" },
      { argsPattern: "diff HEAD~1", status: 0, stdout: exact },
      { argsPattern: "diff --name-status HEAD~1", status: 0, stdout: "" },
    ]);
    const fields = collectGitTemplateFields("/repo");
    expect(fields.git_diff).toBe(exact);
  });
});
