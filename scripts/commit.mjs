#!/usr/bin/env node
import { execSync } from "node:child_process";

const cliArgs = process.argv.slice(2).filter((a) => a !== "--");

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  return execSync(command, {
    stdio: "inherit",
    timeout: 120000,
    ...options,
  });
}

function runCapture(command, options = {}) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
    ...options,
  }).trim();
}

function assertGitRepo() {
  try {
    runCapture("git rev-parse --is-inside-work-tree");
  } catch {
    throw new Error("Not a git repository. Run commit from the repo root.");
  }
}

function hasChanges() {
  const status = runCapture("git status --porcelain");
  return status.length > 0;
}

function parseArgs() {
  /** @type {{ message: string, noVerify: boolean, dryRun: boolean, amend: boolean }} */
  const opts = { message: "", noVerify: false, dryRun: false, amend: false };
  let messageParts = [];

  let i = 0;
  while (i < cliArgs.length) {
    const arg = cliArgs[i];
    if (arg === "-m" || arg === "--message") {
      i++;
      if (i < cliArgs.length) messageParts.push(cliArgs[i]);
    } else if (arg.startsWith("-m=")) {
      messageParts.push(arg.slice(3));
    } else if (arg === "--no-verify" || arg === "-n") {
      opts.noVerify = true;
    } else if (arg === "--dry-run" || arg === "-d") {
      opts.dryRun = true;
    } else if (arg === "--amend") {
      opts.amend = true;
    } else if (!arg.startsWith("-")) {
      // positional message
      messageParts.push(arg);
    }
    i++;
  }

  opts.message = messageParts.join(" ").trim();
  return opts;
}

function validateMessage(message) {
  if (!message) {
    throw new Error(
      "Commit message is required.\n" +
        'Usage: npm run commit -- "type: description"\n' +
        "Conventional commit types: feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert",
    );
  }

  const conventionalPattern = /^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\([^)]*\))?!?: .+/;
  if (!conventionalPattern.test(message)) {
    console.warn(
      `⚠ Warning: Commit message does not match conventional commit format.\n` +
        `  Expected: type(scope): description\n` +
        `  Example:  feat: add new feature\n` +
        `            fix(parser): handle edge case\n` +
        `  Proceeding anyway...\n`,
    );
  }
}

/**
 * commit 指令
 *
 * 用法：
 *   npm run commit "feat: add new feature"
 *   npm run commit -- -m "fix: resolve issue"
 *   npm run commit -- "feat: add feature" --no-verify
 *   npm run commit -- --dry-run
 *   npm run commit -- --amend
 *
 * 说明：
 *   自动 stage 所有改动，按 conventional commit 格式提交。
 */
try {
  assertGitRepo();

  const opts = parseArgs();

  if (opts.dryRun) {
    console.log("Dry run mode - showing what would be committed:\n");
    run("git diff --stat --cached");
    run("git diff --stat");
    const status = runCapture("git status --short");
    if (!status) {
      console.log("No changes to commit.");
    } else {
      console.log("\nFiles to be staged and committed:");
      console.log(status);
    }
    process.exit(0);
  }

  if (!opts.amend && !hasChanges()) {
    console.log("Nothing to commit. Working tree is clean.");
    process.exit(0);
  }

  validateMessage(opts.message);

  // Stage all changes
  if (!opts.amend) {
    console.log("Staging all changes...");
    run("git add -A");
  }

  // Build commit command
  const flags = [];
  if (opts.noVerify) flags.push("--no-verify");
  if (opts.amend) flags.push("--amend");

  const msg = opts.message.replace(/"/g, '\\"');
  run(`git commit -m "${msg}"${flags.length ? " " + flags.join(" ") : ""}`);

  console.log(`\n✓ Committed: ${opts.message}`);
} catch (error) {
  console.error("\nCommit failed.");
  if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exit(1);
}
