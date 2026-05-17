#!/usr/bin/env node
import { execSync } from "node:child_process";

const cliArgs = process.argv.slice(2).filter((a) => a !== "--");

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
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
    throw new Error("Not a git repository. Run push from the repo root.");
  }
}

function getCurrentBranch() {
  return runCapture("git branch --show-current");
}

function hasUpstream(branch) {
  try {
    runCapture(`git rev-parse --abbrev-ref ${branch}@{upstream}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * push 指令 — 推送当前分支与所有标签到远程
 *
 * 用法：
 *   npm run push              # 推送当前分支 + 标签
 *   npm run push -- --tags-only  # 仅推送标签
 *   npm run push -- --branch-only # 仅推送当前分支
 *
 * 说明：
 *   如果有未推送的 commits，会自动推送。
 */
try {
  assertGitRepo();

  const branch = getCurrentBranch();
  if (!branch) {
    throw new Error("Not on any branch (detached HEAD). Cannot push.");
  }

  const tagsOnly = cliArgs.includes("--tags-only");
  const branchOnly = cliArgs.includes("--branch-only");

  console.log(`Current branch: ${branch}`);

  if (!branchOnly && !tagsOnly) {
    // Check if there are commits to push
    const unpushed = hasUpstream(branch)
      ? runCapture(`git log ${branch}@{upstream}..HEAD --oneline`, { stdio: "pipe" })
      : "";

    if (unpushed || !hasUpstream(branch)) {
      console.log(unpushed ? `\nUnpushed commits:\n${unpushed}` : "");
      if (hasUpstream(branch)) {
        run(`git push origin ${branch}`);
      } else {
        console.log("No upstream configured, setting upstream...");
        run(`git push -u origin ${branch}`);
      }
    } else {
      console.log("Branch is up to date, nothing to push.");
    }
  }

  if (!branchOnly && !tagsOnly) {
    // Push tags
    const localTags = runCapture("git tag --points-at HEAD");
    if (localTags) {
      console.log(`\nTags at HEAD: ${localTags.split("\n").join(", ")}`);
    }
    run("git push --tags");
  } else if (tagsOnly) {
    const unpushedTags = runCapture("git push --tags --dry-run 2>&1").replace(/^To /, "");
    if (unpushedTags.trim()) {
      run("git push --tags");
    } else {
      console.log("All tags are up to date.");
    }
  } else if (branchOnly) {
    if (hasUpstream(branch)) {
      run(`git push origin ${branch}`);
    } else {
      run(`git push -u origin ${branch}`);
    }
  }

  console.log(`\n✓ Push complete.`);
} catch (error) {
  console.error("\nPush failed.");
  if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exit(1);
}
