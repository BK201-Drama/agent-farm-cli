# 发布 Agent Farm 侧栏扩展（VSIX）

## 构建

```bash
npm run build
npm run farm:sidebar:build
npm run farm:sidebar:package
```

产物：`extensions/agent-farm-sidebar/agent-farm-sidebar-*.vsix`

## 安装

Cursor → Extensions → `...` → **Install from VSIX…** → 选择上述文件。

## 使用前提

- 本机已 `npm run build` 或全局 `agent-farm` CLI
- 打开含 `.agent-farm/` 的仓库为工作区
- 可选：`npm run farm:control-plane`（侧栏也可自动拉起）

## 发布到 Open VSX（可选）

1. 注册 [Open VSX](https://open-vsx.org/) 命名空间
2. 在 `extensions/agent-farm-sidebar/package.json` 填写 `publisher`
3. `npx ovsx publish extensions/agent-farm-sidebar/*.vsix -p <token>`

未发布前团队内部分发 VSIX 即可。

## 版本对齐

扩展 `package.json` 的 `version` 与 CLI 无强制绑定；`agentFarm.cliPath` 可指向本仓库 `dist/interfaces/cli/index.js`。
