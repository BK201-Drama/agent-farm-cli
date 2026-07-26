import { describe, expect, it } from "vitest";
import {
  buildDecomposePrompt,
  extractJsonArray,
  decomposeRequirement,
} from "../../src/application/wave/decompose-service.js";
import { validateWaveArray } from "../../src/application/wave/wave-validate.js";
import type { ShellRunner } from "../../src/domain/ports/shell-runner.js";

describe("buildDecomposePrompt", () => {
  it("includes the requirement text", () => {
    const prompt = buildDecomposePrompt("实现用户登录", "20260725");
    expect(prompt).toContain("实现用户登录");
  });

  it("includes the date stamp", () => {
    const prompt = buildDecomposePrompt("test", "20260725");
    expect(prompt).toContain("20260725");
  });

  it("includes schema documentation", () => {
    const prompt = buildDecomposePrompt("test", "20260725");
    expect(prompt).toContain("task_id");
    expect(prompt).toContain("dedupe_key");
    expect(prompt).toContain("acceptance_criteria");
    expect(prompt).toContain("plan");
    expect(prompt).toContain("execute");
  });

  it("includes the example output", () => {
    const prompt = buildDecomposePrompt("test", "20260725");
    expect(prompt).toContain("user-auth");
    expect(prompt).toContain("execute-login");
    expect(prompt).toContain("execute-register");
  });

  it("includes dependency and parallel instructions", () => {
    const prompt = buildDecomposePrompt("test", "20260725");
    expect(prompt).toContain("depends_on");
    expect(prompt).toContain("parallel_group");
    expect(prompt).toContain("依赖与并行分析");
  });

  it("uses today's date when dateStamp not provided", () => {
    const prompt = buildDecomposePrompt("test");
    // Should contain a YYYYMMDD datestamp
    expect(prompt).toMatch(/20\d{6}/);
  });
});

describe("extractJsonArray", () => {
  it("extracts bare JSON array", () => {
    const output = '[{"task_id": "a", "dedupe_key": "a", "prompt": "test"}]';
    expect(extractJsonArray(output)).toBe(output);
  });

  it("extracts from markdown code fence", () => {
    const output = 'Here is the wave:\n```json\n[{"task_id": "a"}]\n```\nDone.';
    expect(extractJsonArray(output)).toBe('[{"task_id": "a"}]');
  });

  it("extracts from markdown code fence without json tag", () => {
    const output = '```\n[{"task_id": "a"}]\n```';
    expect(extractJsonArray(output)).toBe('[{"task_id": "a"}]');
  });

  it("extracts from text with surrounding content", () => {
    const output = 'Some text\n[{"task_id": "a"}, {"task_id": "b"}]\nMore text';
    expect(extractJsonArray(output)).toBe('[{"task_id": "a"}, {"task_id": "b"}]');
  });

  it("extracts multi-line JSON array", () => {
    const output = `Sure, here is the decompose result:

\`\`\`json
[
  {
    "task_id": "test-20260725-plan",
    "dedupe_key": "test-20260725-plan",
    "mode": "plan",
    "prompt": "Analyze the codebase and plan the implementation..."
  },
  {
    "task_id": "test-20260725-execute",
    "dedupe_key": "test-20260725-execute",
    "mode": "execute",
    "prompt": "Implement the feature...",
    "acceptance_criteria": "npm run check && npm test"
  }
]
\`\`\`

Let me know if you need changes.`;
    const extracted = extractJsonArray(output);
    const parsed = JSON.parse(extracted);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].mode).toBe("plan");
    expect(parsed[1].mode).toBe("execute");
  });

  it("throws when no JSON array found", () => {
    expect(() => extractJsonArray("Just some random text")).toThrow(/无法从 LLM 输出中提取 JSON 数组/);
  });

  it("throws when output is empty", () => {
    expect(() => extractJsonArray("")).toThrow(/无法从 LLM 输出中提取 JSON 数组/);
  });

  it("handles nested brackets in prompts", () => {
    const output = `[
      {
        "task_id": "test-plan",
        "dedupe_key": "test-plan",
        "prompt": "Use JSON.parse() and JSON.stringify() for serialization"
      }
    ]`;
    const extracted = extractJsonArray(output);
    expect(() => JSON.parse(extracted)).not.toThrow();
  });
});

describe("decomposeRequirement", () => {
  const validWaveOutput = JSON.stringify([
    {
      task_id: "user-auth-20260725-plan",
      dedupe_key: "user-auth-20260725-plan",
      mode: "plan",
      priority: 2,
      read_paths: ["src/", "package.json"],
      depends_on: [],
      parallel_group: "plan",
      prompt:
        "仓库根：本仓库。目标：实现用户登录功能。先 Read src/ 和 package.json 了解项目结构。" +
        "输出实现清单（文件路径 + 验收要点）；不写代码。验收：npm run check 必须通过。",
    },
    {
      task_id: "user-auth-20260725-execute",
      dedupe_key: "user-auth-20260725-execute",
      mode: "execute",
      priority: 3,
      task_type: "code_gen",
      read_paths: ["src/"],
      depends_on: ["user-auth-20260725-plan"],
      parallel_group: "impl",
      empty_run_grace_minutes: 10,
      prompt:
        "仓库根：本仓库。目标：实现用户登录功能。先 Read 上一条 plan 产出与 src/。" +
        "实现登录 API、密码验证、session 管理。禁止超过 10 分钟无任何 git diff；" +
        "每步后 git status。验收：npm run check && npm test 全绿。",
      acceptance_criteria: "npm run check && npm test",
    },
  ]);

  function mockShellRunner(output: string, exitCode = 0): ShellRunner {
    return async () => ({ exitCode, output });
  }

  it("decomposes requirement successfully", async () => {
    const items = await decomposeRequirement("实现用户登录", {
      shellRunner: mockShellRunner(validWaveOutput),
      dateStamp: "20260725",
    });

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(2);
    // First item should be plan
    expect(items[0]?.mode).toBe("plan");
    // Should have at least one execute
    const executeItems = items.filter((i) => i.mode === "execute");
    expect(executeItems.length).toBeGreaterThanOrEqual(1);
    // Execute items should have acceptance_criteria
    for (const item of executeItems) {
      expect(String(item.acceptance_criteria ?? "")).not.toBe("");
    }
  });

  it("validates output passes validateWaveArray", async () => {
    const items = await decomposeRequirement("实现用户登录", {
      shellRunner: mockShellRunner(validWaveOutput),
      dateStamp: "20260725",
    });

    const warnings = validateWaveArray(items, "test-decompose.json");
    // Warnings are ok; no throws means validation passed
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("throws when LLM exits non-zero", async () => {
    await expect(
      decomposeRequirement("test", {
        shellRunner: mockShellRunner("error", 1),
        dateStamp: "20260725",
      }),
    ).rejects.toThrow(/LLM decompose 失败/);
  });

  it("throws when LLM output is not valid JSON", async () => {
    await expect(
      decomposeRequirement("test", {
        shellRunner: mockShellRunner("not json at all"),
        dateStamp: "20260725",
      }),
    ).rejects.toThrow(/无法从 LLM 输出中提取 JSON 数组/);
  });

  it("throws when LLM output is JSON object instead of array", async () => {
    await expect(
      decomposeRequirement("test", {
        shellRunner: mockShellRunner('{"key": "value"}'),
        dateStamp: "20260725",
      }),
    ).rejects.toThrow(/无法从 LLM 输出中提取 JSON 数组/);
  });

  it("handles markdown-wrapped output from mock LLM", async () => {
    const markdownOutput =
      "Here is your wave:\n```json\n" + validWaveOutput + "\n```\nDone.";
    const items = await decomposeRequirement("实现用户登录", {
      shellRunner: mockShellRunner(markdownOutput),
      dateStamp: "20260725",
    });

    expect(Array.isArray(items)).toBe(true);
  });

  it("preserves depends_on and parallel_group fields in output", async () => {
    const items = await decomposeRequirement("test", {
      shellRunner: mockShellRunner(validWaveOutput),
      dateStamp: "20260725",
    });

    // Plan should have empty depends_on and parallel_group
    expect(items[0]?.depends_on).toEqual([]);
    expect(items[0]?.parallel_group).toBe("plan");

    // Execute should depend on plan
    expect(items[1]?.depends_on).toEqual(["user-auth-20260725-plan"]);
    expect(items[1]?.parallel_group).toBe("impl");
  });

  it("throws when wave validation fails (missing acceptance_criteria on execute)", async () => {
    const invalidWave = JSON.stringify([
      {
        task_id: "test-20260725-plan",
        dedupe_key: "test-20260725-plan",
        mode: "plan",
        prompt:
          "仓库根：本仓库。目标：test。输出实现清单。验收：npm run check 必须通过。",
      },
      {
        task_id: "test-20260725-execute",
        dedupe_key: "test-20260725-execute",
        mode: "execute",
        prompt: "Implement the feature with enough characters to pass minimum length check...",
      },
    ]);

    await expect(
      decomposeRequirement("test", {
        shellRunner: mockShellRunner(invalidWave),
        dateStamp: "20260725",
      }),
    ).rejects.toThrow(/acceptance_criteria/);
  });
});
