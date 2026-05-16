/**
 * M3 onboarding 检查逻辑（供脚本与 test/scripts TDD 复用）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function resolveCliArgv(root) {
  const distCli = join(root, "dist/interfaces/cli/index.js");
  const tsxCli = join(root, "node_modules/tsx/dist/cli.mjs");
  const srcCli = join(root, "src/interfaces/cli/index.ts");
  if (existsSync(distCli)) return { argv: [distCli], usesDist: true };
  return { argv: [tsxCli, srcCli], usesDist: false };
}

export function mkIsolatedJsonlQueue(prefix = "af-onboard-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const q = join(dir, ".agent-farm", "queue");
  mkdirSync(q, { recursive: true });
  writeFileSync(join(q, "tasks.jsonl"), "");
  writeFileSync(join(q, "events.jsonl"), "");
  writeFileSync(join(q, "quarantine_tasks.jsonl"), "");
  return {
    dir,
    q,
    taskFile: join(q, "tasks.jsonl"),
    quarantineFile: join(q, "quarantine_tasks.jsonl"),
  };
}

export function runCli(root, args, cwd = root, env = {}) {
  const { argv } = resolveCliArgv(root);
  return spawnSync(process.execPath, [...argv, ...args], {
    cwd,
    env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1", ...env },
    encoding: "utf8",
  });
}

/**
 * @param {object} opts
 * @param {string} opts.root - 仓库根
 * @param {boolean} [opts.skipRepoDoctor]
 * @param {boolean} [opts.skipValidateWaves]
 * @param {boolean} [opts.skipValidateReports]
 * @param {boolean} [opts.skipEmbedMinimal]
 */
export function runOnboardingChecks(opts) {
  const root = opts.root;
  const steps = [];
  let failed = 0;

  const record = (label, r) => {
    const ok = r.status === 0;
    steps.push({ label, ok, status: r.status ?? 1 });
    if (!ok) failed++;
    return ok;
  };

  record("CLI --version", runCli(root, ["--version"]));

  const repoQueue = join(root, ".agent-farm", "queue");
  if (!opts.skipRepoDoctor && existsSync(repoQueue)) {
    record("doctor --ci-exit（本仓库队列）", runCli(root, ["doctor", "--ci-exit"]));
  } else {
    steps.push({ label: "doctor --ci-exit（本仓库队列）", ok: true, skipped: true });
  }

  const iso = mkIsolatedJsonlQueue();
  record(
    "demo task noop（隔离目录）",
    runCli(root, ["demo", "task", "--template", "noop", "--task-file", iso.taskFile], iso.dir, {
      AGENT_FARM_STORAGE: "jsonl",
    }),
  );
  record(
    "doctor --ci-exit（隔离空队列）",
    runCli(
      root,
      ["doctor", "--ci-exit", "--task-file", iso.taskFile, "--quarantine-file", iso.quarantineFile],
      iso.dir,
      { AGENT_FARM_STORAGE: "jsonl" },
    ),
  );

  if (!opts.skipValidateWaves) {
    record(
      "validate:waves",
      spawnSync("npm", ["run", "validate:waves"], { cwd: root, shell: true, encoding: "utf8" }),
    );
  }
  if (!opts.skipValidateReports) {
    record(
      "validate:reports",
      spawnSync("npm", ["run", "validate:reports"], { cwd: root, shell: true, encoding: "utf8" }),
    );
  }

  const publicApi = join(root, "dist/application/public-api.js");
  if (!opts.skipEmbedMinimal && existsSync(publicApi)) {
    record(
      "embed-minimal",
      spawnSync(process.execPath, [join(root, "examples/embed-minimal/run.mjs")], {
        cwd: root,
        encoding: "utf8",
      }),
    );
  } else if (!opts.skipEmbedMinimal) {
    steps.push({ label: "embed-minimal", ok: true, skipped: true });
  }

  return { steps, failed, ok: failed === 0 };
}
