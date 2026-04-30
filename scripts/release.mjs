#!/usr/bin/env node
import { execSync } from "node:child_process";

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", ...options });
}

function runCapture(command, options = {}) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

const npmRegistry = process.env.NPM_REGISTRY || "https://registry.npmjs.org";
const otp = process.env.NPM_OTP || "";
const publishArgs = [`npm publish --access public --registry ${npmRegistry}`];
if (otp) {
  publishArgs.push(`--otp ${otp}`);
}

try {
  run(`npm config set registry ${npmRegistry}`);
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
