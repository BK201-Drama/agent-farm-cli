#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const RELEASE_ENV = { ...process.env };
for (const key of ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"]) {
  delete RELEASE_ENV[key];
}

/** @type {string[]} */
const cliArgs = process.argv.slice(2).filter((a) => a !== "--");

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: RELEASE_ENV,
    timeout: 600000,
    ...options,
  });
}

function runCapture(command, options = {}) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: RELEASE_ENV,
    timeout: 120000,
    ...options,
  }).trim();
}

function readPackageVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

function assertGitRepo() {
  try {
    runCapture("git rev-parse --is-inside-work-tree");
  } catch {
    throw new Error("Not a git repository. Run release from the repo root.");
  }
}

function assertCleanWorkingTree() {
  const status = runCapture("git status --porcelain");
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash other changes before release.\n" + status);
  }
}

function resolveVersionSpec() {
  const explicit = process.env.RELEASE_VERSION || cliArgs.find((a) => /^\d+\.\d+\.\d+/.test(a));
  if (explicit) {
    return { kind: "exact", value: explicit.replace(/^v/, "") };
  }
  const bump = process.env.RELEASE_BUMP || cliArgs[0] || "patch";
  if (!["patch", "minor", "major", "prepatch", "preminor", "premajor", "prerelease"].includes(bump)) {
    throw new Error(`Invalid bump "${bump}". Use patch|minor|major or set RELEASE_VERSION=1.2.3`);
  }
  return { kind: "bump", value: bump };
}

function bumpPackageVersion(spec) {
  const before = readPackageVersion();
  if (spec.kind === "exact") {
    run(`npm version ${spec.value} --no-git-tag-version --allow-same-version`);
  } else {
    run(`npm version ${spec.value} --no-git-tag-version`);
  }
  const after = readPackageVersion();
  if (after === before && spec.kind === "bump") {
    throw new Error(`Version did not change (still ${before}).`);
  }
  return after;
}

function updateChangelog(version) {
  const changelogPath = "CHANGELOG.md";
  if (!existsSync(changelogPath)) {
    console.warn("⚠ CHANGELOG.md not found, skipping changelog update.");
    return;
  }

  const content = readFileSync(changelogPath, "utf8");

  // Build date string in YYYY-MM-DD format
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  // Replace "## [Unreleased]" with version header, keeping it as a new section
  const unreleasedHeader = "## [Unreleased]";
  const versionHeader = `## [${version}] — ${dateStr}`;

  if (!content.includes(unreleasedHeader)) {
    console.warn("⚠ [Unreleased] section not found in CHANGELOG.md, skipping changelog update.");
    return;
  }

  // Insert the version section between [Unreleased] and the next version
  const newContent = content.replace(unreleasedHeader, `${unreleasedHeader}\n\n${versionHeader}`);

  writeFileSync(changelogPath, newContent, "utf8");
  console.log(`\nUpdated CHANGELOG.md with ${versionHeader}`);
}

function commitRelease(version) {
  const files = ["package.json"];
  if (existsSync("package-lock.json")) {
    files.push("package-lock.json");
  }
  if (existsSync("CHANGELOG.md")) {
    files.push("CHANGELOG.md");
  }
  run(`git add ${files.join(" ")}`);

  const staged = runCapture("git diff --cached --name-only")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const allowed = new Set(files);
  const extra = staged.filter((f) => !allowed.has(f));
  if (extra.length) {
    throw new Error(`Refusing to commit unexpected staged files: ${extra.join(", ")}`);
  }
  if (!staged.length) {
    throw new Error("No release files staged after npm version.");
  }

  const message = process.env.RELEASE_COMMIT_MESSAGE || `chore(release): ${version}`;
  run(`git commit -m ${JSON.stringify(message)}`);
}

function createGitTag(version) {
  const tag = `v${version}`;
  try {
    runCapture(`git tag -d ${tag}`, { stdio: "ignore" });
  } catch {
    // tag doesn't exist, that's fine
  }
  run(`git tag -a ${tag} -m "Release ${tag}"`);
  console.log(`\nCreated git tag: ${tag}`);
}

/**
 * release 指令 — 自动升级版本、更新 changelog、打 tag、发布到 npm
 *
 * 环境变量：
 * - NPM_REGISTRY（默认 https://registry.npmjs.org）
 * - NPM_OTP（npm 2FA 一次性码）
 * - RELEASE_VERSION=1.2.3（精确版本，优先于 bump）
 * - RELEASE_BUMP=patch|minor|major（默认 patch）
 * - RELEASE_COMMIT_MESSAGE（默认 chore(release): <version>）
 *
 * 用法：
 *   npm run release                    # 默认 patch bump
 *   npm run release -- patch           # patch bump
 *   npm run release -- minor           # minor bump
 *   npm run release -- 0.1.55          # 精确版本
 *   RELEASE_BUMP=major npm run release # major bump
 *
 * 流程：
 *   1. 验证 npm 登录
 *   2. 升级 package.json 版本号
 *   3. 更新 CHANGELOG.md（[Unreleased] → 版本号 + 日期）
 *   4. git add + commit（package.json, package-lock.json, CHANGELOG.md）
 *   5. 创建 git tag v<version>
 *   6. npm publish
 *   7. 提示执行 npm run push 推送
 */
const npmRegistry = process.env.NPM_REGISTRY || "https://registry.npmjs.org";
const otp = process.env.NPM_OTP || "";
const publishArgs = [`npm publish --access public --registry ${npmRegistry}`];
if (otp) {
  publishArgs.push(`--otp ${otp}`);
}

try {
  const whoami = runCapture(`npm whoami --registry ${npmRegistry}`);
  console.log(`Logged in npm user: ${whoami}`);

  assertGitRepo();
  assertCleanWorkingTree();

  const spec = resolveVersionSpec();
  const version = bumpPackageVersion(spec);
  console.log(`\nVersion bumped to ${version}`);

  updateChangelog(version);

  commitRelease(version);
  console.log(`\nCreated release commit for ${version}`);

  createGitTag(version);

  run(publishArgs.join(" "));

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓ Release v${version} complete!`);
  console.log(`  Run "npm run push" to push commits and tags.`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
} catch (error) {
  console.error("\nRelease failed.");
  if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exit(1);
}
