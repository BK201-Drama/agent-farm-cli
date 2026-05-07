import { describe, expect, it } from "vitest";
import {
  directoryMatchesWorkspace,
  extractFeedRowsFromExport,
} from "../src/infrastructure/opencode/opencode-feed.js";

describe("directoryMatchesWorkspace", () => {
  it("matches after normalizing slashes and case (Windows-friendly)", () => {
    expect(
      directoryMatchesWorkspace("C:\\Repo\\Proj", "c:/repo/proj"),
    ).toBe(true);
  });

  it("rejects different directories", () => {
    expect(directoryMatchesWorkspace("/a/b", "/a/c")).toBe(false);
  });

  it("rejects missing directory", () => {
    expect(directoryMatchesWorkspace(undefined, "/x")).toBe(false);
  });
});

describe("extractFeedRowsFromExport", () => {
  it("pulls newest assistant reasoning, tool, and text parts", () => {
    const rows = extractFeedRowsFromExport(
      {
        info: { id: "sess-1", title: "t" },
        messages: [
          {
            info: { role: "user" },
            parts: [{ type: "text", text: "hi" }],
          },
          {
            info: { role: "assistant" },
            parts: [
              { type: "reasoning", text: "think deep" },
              { type: "tool", tool: "read", state: { status: "done", input: { path: "x" } } },
              { type: "text", text: "done" },
            ],
          },
        ],
      } as Record<string, unknown>,
      5,
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.some((r) => r.kind === "推理" && r.body.includes("think"))).toBe(true);
    expect(rows.some((r) => r.kind === "工具" && r.body.includes("read"))).toBe(true);
    expect(rows.some((r) => r.kind === "回复" && r.body.includes("done"))).toBe(true);
  });
});
