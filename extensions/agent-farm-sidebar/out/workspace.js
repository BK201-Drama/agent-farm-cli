"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAgentFarmWorkspaceRoot = resolveAgentFarmWorkspaceRoot;
exports.normalizePath = normalizePath;
exports.healthMatchesWorkspace = healthMatchesWorkspace;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const vscode = __importStar(require("vscode"));
function hasAgentFarmDir(root) {
    return (0, node_fs_1.existsSync)((0, node_path_1.join)(root, ".agent-farm"));
}
/** 解析 agent-farm 工作区根：配置 > 含 .agent-farm 的 folder > 第一个 folder。 */
function resolveAgentFarmWorkspaceRoot() {
    const cfg = vscode.workspace.getConfiguration("agentFarm");
    const configured = cfg.get("workspaceFolder")?.trim();
    if (configured && hasAgentFarmDir(configured))
        return configured;
    const folders = vscode.workspace.workspaceFolders ?? [];
    const withFarm = folders.filter((f) => hasAgentFarmDir(f.uri.fsPath));
    if (withFarm.length === 1)
        return withFarm[0].uri.fsPath;
    if (withFarm.length > 1)
        return withFarm[0].uri.fsPath;
    return folders[0]?.uri.fsPath;
}
function normalizePath(p) {
    return p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
}
function healthMatchesWorkspace(queueCwd, workspaceRoot) {
    if (!queueCwd || !workspaceRoot)
        return false;
    return normalizePath(queueCwd) === normalizePath(workspaceRoot);
}
//# sourceMappingURL=workspace.js.map