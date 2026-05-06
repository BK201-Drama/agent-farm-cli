#!/usr/bin/env node
import { execSync } from "node:child_process";

const RELEASE_ENV = { ...process.env };
for (const key of [
  "http_proxy",
  "https_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "all_proxy",
  "ALL_PROXY",
]) {
  delete RELEASE_ENV[key];
}

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: RELEASE_ENV,
    timeout: 120000,
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

/** 发版环境变量：NPM_REGISTRY（默认 registry.npmjs.org）、NPM_OTP（2FA 一次性码）。不修改用户全局 npm config。 */
const npmRegistry = process.env.NPM_REGISTRY || "https://registry.npmjs.org";
const otp = process.env.NPM_OTP || "";
const publishArgs = [`npm publish --access public --registry ${npmRegistry}`];
if (otp) {
  publishArgs.push(`--otp ${otp}`);
}

try {
  const whoami = runCapture(`npm whoami --registry ${npmRegistry}`);
  console.log(`Logged in npm user: ${whoami}`);

  run("npm run check");
  run("npm run build");
  run(publishArgs.join(" "));

  console.log("\nRelease complete.");
} catch (error) {
  console.error("\nRelease failed.");
  process.exit(1);
}
