import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    /** Ink 在 `is-in-ci` 为真时跳过清屏与 log-update；GHA 的 CI=true 会导致集成测试收不到 \\x1b[2J。 */
    env: { CI: "0" },
  },
});
