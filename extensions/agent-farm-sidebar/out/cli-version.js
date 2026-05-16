"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAgentFarmCliVersion = readAgentFarmCliVersion;
exports.warnIfCliVersionMismatch = warnIfCliVersionMismatch;
const node_child_process_1 = require("node:child_process");
const control_plane_process_js_1 = require("./control-plane-process.js");
async function readAgentFarmCliVersion(launch) {
    return new Promise((resolve) => {
        const args = [...launch.argsPrefix, "--version"];
        const child = (0, node_child_process_1.spawn)(launch.command, args, {
            shell: (0, control_plane_process_js_1.shouldUseShellForSpawn)(launch),
            stdio: ["ignore", "pipe", "ignore"],
        });
        let out = "";
        child.stdout?.on("data", (c) => {
            out += c.toString();
        });
        child.on("close", () => {
            const m = out.match(/\d+\.\d+\.\d+/);
            resolve(m?.[0]);
        });
        child.on("error", () => resolve(undefined));
        setTimeout(() => {
            child.kill();
            resolve(undefined);
        }, 5000);
    });
}
function warnIfCliVersionMismatch(cliVersion, expectedMin = "0.1.47") {
    if (!cliVersion)
        return "未检测到 agent-farm CLI 版本，请 npm i -g agent-farm-cli 或在本仓库 npm run build";
    const pa = cliVersion.split(".").map(Number);
    const pb = expectedMin.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) < (pb[i] ?? 0)) {
            return `CLI ${cliVersion} 过旧，建议 >= ${expectedMin}（侧栏 stuck API 需新版）`;
        }
        if ((pa[i] ?? 0) > (pb[i] ?? 0))
            break;
    }
    return undefined;
}
//# sourceMappingURL=cli-version.js.map