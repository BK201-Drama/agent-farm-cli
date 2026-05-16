# ADR：可插拔 Executor 插件

状态：**草案（M1）** · 目标：**M2** 首个备选实现 Cursor Agent SDK

## 背景

当前 `processClaimedTask` 直接调用 shell/OpenCode 路径。大方向要求 **OpenCode 继续可用**，并支持 **Cursor SDK** 等备选 executor。

## 决策（草案）

1. 定义 **`ExecutorPlugin`**（application 层端口），职责：
   - `runExecute(ctx, template) -> { exitCode, output }`
   - 可选 `runVerify` / `runAiReview` 或沿用全局模板 + shell
2. **注册表**：`project init` / env `AGENT_FARM_EXECUTOR=opencode|shell|cursor-sdk`
3. **默认**：与今日行为一致的 `OpencodeExecutorPlugin`（包装现有 `runShellWithOptionalOpencodeJsonStream`）
4. **不改 domain**；`processClaimedTask` 仅依赖端口

## 非目标（M1）

- 完整 Cursor SDK 实现
- 远程 executor

## M2 清单

- [ ] `ExecutorPlugin` 接口 + 单测
- [ ] `ShellExecutorPlugin`（显式化现有模板）
- [ ] `CursorSdkExecutorPlugin` spike
- [ ] worker CLI `--executor` 与 init 对齐
