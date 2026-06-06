import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["test/helpers/vitest-global-setup.ts"],
    environment: "node",
    testTimeout: 30_000,
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    /** Ink 在 `is-in-ci` 为真时跳过清屏与 log-update；GHA 的 CI=true 会导致集成测试收不到 \x1b[2J。 */
    env: { CI: "0" },
    /**
     * Windows: >2 concurrent fork workers cause child_process.spawn to
     * fail inside workers (status=null, stderr=undefined). singleFork
     * avoids this OS-level process-creation bottleneck while keeping
     * tests reliable. On Linux/macOS workers can be raised or the
     * override removed.
     */
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
