import { spawnSync } from "node:child_process";
import { packageName } from "./registry-client.js";

export type NpmInstallTarget = {
  kind: "global" | "local";
  projectRoot?: string;
  tag: string;
};

export function runNpmInstallPackage(target: NpmInstallTarget): { ok: boolean; command: string; stderr: string } {
  const spec = `${packageName()}@${target.tag}`;
  const args = target.kind === "global" ? ["install", "-g", spec] : ["install", spec];
  const cwd = target.kind === "local" ? target.projectRoot : undefined;
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: process.env,
  });
  const command = cwd ? `npm ${args.join(" ")} (cwd ${cwd})` : `npm ${args.join(" ")}`;
  if (result.status === 0) {
    return { ok: true, command, stderr: result.stderr ?? "" };
  }
  const stderr = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
  return { ok: false, command, stderr: stderr || `npm exit ${result.status ?? "unknown"}` };
}
