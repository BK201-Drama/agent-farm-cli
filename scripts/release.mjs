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

const npmRegistry = process.env.NPM_REGISTRY || "https://registry.npmjs.org";
const otp = process.env.NPM_OTP || "";
const publishArgs = [`npm publish --access public --registry ${npmRegistry}`];
if (otp) {
  publishArgs.push(`--otp ${otp}`);
}

try {
  run(`npm config set registry ${npmRegistry}`);
  run("npm config delete proxy");
  run("npm config delete https-proxy");
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
