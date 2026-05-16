import { describe, expect, it } from "vitest";
import { compareSemver } from "../../src/domain/semver/compare.js";
import { runSelfUpdate } from "../../src/application/use-cases/self-update/run-self-update.js";

describe("compareSemver", () => {
  it("orders patch releases", () => {
    expect(compareSemver("0.1.51", "0.1.52")).toBeLessThan(0);
    expect(compareSemver("0.1.52", "0.1.52")).toBe(0);
    expect(compareSemver("v0.2.0", "0.1.99")).toBeGreaterThan(0);
  });
});

describe("runSelfUpdate", () => {
  it("reports up to date without installing", async () => {
    const result = await runSelfUpdate({
      currentVersion: "0.9.0",
      checkOnly: true,
      fetchLatest: async () => ({
        name: "agent-farm-cli",
        version: "0.9.0",
        registry: "https://registry.npmjs.org",
      }),
      cliEntryUrl: import.meta.url,
    });
    expect(result.ok).toBe(true);
    expect(result.update_available).toBe(false);
    expect(result.updated).toBe(false);
  });

  it("requires --yes before install", async () => {
    const result = await runSelfUpdate({
      currentVersion: "0.1.0",
      yes: false,
      installKind: "global",
      fetchLatest: async () => ({
        name: "agent-farm-cli",
        version: "9.9.9",
        registry: "https://registry.npmjs.org",
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.update_available).toBe(true);
    expect(result.updated).toBe(false);
  });

  it("skips npm install in dev tree", async () => {
    const devEntry = new URL("../../src/interfaces/cli/register/self-update.ts", import.meta.url);
    const result = await runSelfUpdate({
      currentVersion: "0.1.52",
      yes: true,
      fetchLatest: async () => ({
        name: "agent-farm-cli",
        version: "9.9.9",
        registry: "https://registry.npmjs.org",
      }),
      cliEntryUrl: devEntry.href,
    });
    expect(result.install_kind).toBe("skipped");
    expect(result.updated).toBe(false);
    expect(result.ok).toBe(true);
  });
});
