# ADR：可插拔 Executor 插件

状态：**草案（M1）** · 目标：**M2** 首个备选实现 Cursor Agent SDK

## 背景

当前 `processClaimedTask`（`src/application/worker/process-claimed-task/index.ts:44`）直接通过 shell 模板调用 OpenCode。大方向要求 **OpenCode 继续可用**，并支持 **Cursor Agent SDK** 等备选 executor，同时不破坏现有行为。

当前每条 task 的 3 阶段管线：

```
runExecuteStage → runVerifyStageIfConfigured → runAiReviewStage
```

三阶段均通过 `runShellWithOptionalOpencodeJsonStream` → `ShellRunner`（domain port）执行。`ShellRunner` 是领域端口（`src/domain/ports/shell-runner.ts`），
但 executor 替换需要高于 shell runner 的抽象——executor 可能不走 shell（如 Cursor SDK 直接程序化调用），但仍需复用模板展开与重试自愈逻辑。

## 决策（草案）

### 1. `ExecutorPlugin` 接口（application 层端口）

文件位置：`src/application/worker/executor-plugin.ts`

```typescript
import type { JsonMap } from "../../domain/task.js";
import type { ShellRunner } from "../../domain/ports/shell-runner.js";
import type { TemplateContext } from "../command-template.js";

/** execute / verify 阶段的统一返回 */
export type ExecutorStageResult =
  | { ok: true; output: string }
  | { ok: false; error?: string };

/** 注入给 ExecutorPlugin 的任务上下文（子集，不含状态机操作） */
export interface ExecutorPluginContext {
  task: JsonMap;
  taskId: string;
  taskAttempt: number;
  runsDir: string;
  /** 任务执行的工作区路径（可能为 worktree 目录） */
  workspaceDir: string;
  tplCtx: () => TemplateContext;
  env: NodeJS.ProcessEnv;
  /** 持续心跳回调，执行器在长时间工作中应定期调用 */
  heartbeat: () => Promise<void>;
  /** 原始 ShellRunner，供需要 shell fallback 的 plugin 使用 */
  runShell: ShellRunner;
}

export interface ExecutorPlugin {
  /** executor 标识（如 "opencode" / "shell" / "cursor-sdk"） */
  readonly kind: string;

  /** 执行阶段：替换 runExecuteStage 中的 shell 调用 */
  runExecute(
    ctx: ExecutorPluginContext,
    commandTemplate: string,
  ): Promise<ExecutorStageResult>;

  /** 可选验证阶段：未提供时回退到 shell 模板执行 */
  runVerify?(
    ctx: ExecutorPluginContext,
    verifyCommandTemplate: string,
  ): Promise<{ ok: true } | { ok: false }>;
}
```

**设计权衡**：
- `runAiReview` 不放入接口——现阶段 AI 验收逻辑（verdict 解析、fix block 注入）与 executor 种类弱相关，统一走 shell 模板。
- 若未来 executor（如 SDK）需要在验收阶段复用上下文，可通过 `runVerify` 自定语义或扩展接口，不作 M2 承诺。
- `ExecutorPluginContext` 不暴露 `taskCommands` / `eventRepo`，防止 plugin 越过编排层直接写状态。

### 2. 注册方式

**注册表**：`src/application/worker/executor-registry.ts`

```typescript
type ExecutorPluginFactory = (deps: ExecutorPluginFactoryDeps) => ExecutorPlugin;

export interface ExecutorRegistry {
  register(name: string, factory: ExecutorPluginFactory): void;
  resolve(name: string): ExecutorPlugin | undefined;
  list(): string[];
}

// 内置注册表实现：Map<string, ExecutorPluginFactory>
```

**选择 executor 的优先级**：
1. 环境变量 `AGENT_FARM_EXECUTOR`（最高）
2. CLI `--executor` 参数
3. 注册表默认值 `"opencode"`（向后兼容）

**CLI 注册**（`src/interfaces/cli/register/worker.ts`）：
- 新增 `--executor <name>` 选项（可选，默认 `opencode`）
- 启动时：`const executor = registry.resolve(name ?? "opencode")`

**`project init` 注册**（已有 `--executor opencode|codex|claude`）：
- 写入 `executor` 字段到项目配置（如 `.agent-farm/config.json`）
- 不强制等于 plugin name；`project init --executor cursor-sdk` 未来可直接对应注册表 key

### 3. 与 `processClaimedTask` 的衔接

修改 `ProcessClaimedTaskDeps`，新增可选字段（不改已存在的字段）：

```typescript
export type ProcessClaimedTaskDeps = {
  // ... 现有字段全部保留，新增：
  executor?: ExecutorPlugin;   // M2：可插拔执行器，未提供时走旧 shell 路径
};
```

在 `processClaimedTask` 内部：

```
stage_execute:
  if executor → executor.runExecute(ctx, template)
    → 非 ok 时沿用现有 retry/heal 路径（taskCommands.updateStatus 等在外层）
  else → 现有 runExecuteStage(shellCtx, template)  // 向后兼容

stage_verify:
  if executor?.runVerify → executor.runVerify(ctx, template)
  else → 现有 runVerifyStageIfConfigured(shellCtx, template)

stage_ai_review:
  无变化（始终走 shell 模板）
```

**领域层零改动**：`TaskRecord`、`ShellRunner`、`TaskStatus` 等无需修改。

### 4. 默认 `OpencodeExecutorPlugin`（适配器）

包装现有 `runShellWithOptionalOpencodeJsonStream` 行为，作为注册表默认项：

```typescript
export function createOpencodeExecutorPlugin(deps: {
  enableStream: boolean;
}): ExecutorPlugin {
  return {
    kind: "opencode",
    async runExecute(ctx, template) {
      const cmd = expandCommandTemplate(template, ctx.tplCtx());
      const { exitCode, output } = await runShellWithOptionalOpencodeJsonStream(cmd, {
        runShell: ctx.runShell,
        onHeartbeat: ctx.heartbeat,
        env: ctx.env,
        enableStream: deps.enableStream,
      });
      if (exitCode !== 0) {
        return { ok: false, error: output };
      }
      return { ok: true, output };
    },
  };
}
```

**注意**：`OpencodeStreamObserver`（`runShellWithOptionalOpencodeJsonStream` 返回值中的 `streamObs`）在 adapter 里暂不可达。M2 实现时需将 stream observer 回调注入 `ExecutorPluginContext`，或在 adapter 内通过 `onStdoutLine` 接口桥接。此为 M2 实现细节，不修改接口草案。

### 5. `ShellExecutorPlugin`（显式化现有 shell 行为，不含 OpenCode 可观测增强）

不做 NDJSON 解析、不注入 heal block。适用于 `codex` / `claude` / 自定义命令。

### 6. 重试自愈（heal block）归属

当前 retry 时 `healBlockFromObserver` 依赖 `OpencodeStreamObserver`（解析 `opencode-ai --format json` NDJSON）。plugin 模式下：
- `OpencodeExecutorPlugin` adapter 输出 stream 信息回到 `processClaimedTask`，继续注入 heal block；
- 非 OpenCode executor（如 `ShellExecutorPlugin`）不产生 NDJSON observer，retry 时仅保留原始 prompt + last_error；
- retry 的 `taskCommands.updateStatus` 调用留在 `processClaimedTask` 编排层，不推入 plugin。

## 非目标（M1 / M2）

- **不实现远程 executor / gRPC executor**：连接方式留待 M3+
- **不修改 domain 层**：TaskRecord、TaskStatus、ShellRunner 接口不动
- **不替换 AI review stage 的 shell 路径**：`runAiReviewStage` 保持仅 shell
- **不引入动态插件加载（npm 包 / 热加载）**：注册表限于进程内工厂函数
- **不拆分 `EXECUTOR_PRESETS` map**：现有预设仍是 `project init` 的模板参考，plugin 注册表独立
- **不做 executor 间 session 去重或跨 executor 重试**：单条 task 生命周期内 executor 不变

## Cursor Agent SDK 迁移步骤（M2 首个备选 executor）

### 前提

Cursor Agent SDK（`@cursor/agent-sdk` 或等价 npm 包）需在仓库内安装为 dependency（非 devDependency）。SDK 提供程序化调用接口，类似：

```typescript
import { CursorAgent } from "@cursor/agent-sdk";
const agent = new CursorAgent({ workspaceDir, env });
const result = await agent.run({ prompt, maxTurns, ... });
```

### 迁移步骤

1. **[ ] SDK 可行性探测**
   - 在 `src/infrastructure/` 下新建 `cursor-sdk/probe.ts`，类似 `opencode-run-probe.ts`
   - 检查 `@cursor/agent-sdk` 是否可 import、基本 API 签名是否正确
   - 通过 `agent-farm doctor` 输出 SDK 可用性

2. **[ ] `CursorSdkExecutorPlugin` 实现**
   - `src/infrastructure/cursor-sdk/cursor-sdk-executor.ts`
   - 实现 `ExecutorPlugin` 的 `runExecute`
   - 将 `ExecutorPluginContext.tplCtx()` 展开后传入 SDK 的 `run()` 方法
   - env 透传；`heartbeat` 通过 `setInterval` 或 SDK 内置回调桥接
   - `runVerify` 暂不实现（走 shell fallback）

3. **[ ] 注册到 registry**
   - 在 `src/bootstrap/container.ts`（或新工厂文件）注册 `"cursor-sdk"` → factory
   - factory 内做 try-catch：若 SDK 未安装，`resolve("cursor-sdk")` 返回 `undefined` 并打印 warning

4. **[ ] worker loop 集成**
   - `runWorkerLoop` 的 `WorkerOptions` 新增可选 `executor?: string`
   - `processClaimedTask` 的 `ProcessClaimedTaskDeps.executor` 从 registry 解析
   - 找不到对应 plugin 时 fallback 到纯 shell 路径并打印 warning

5. **[ ] CLI 注册**
   - `registerWorkerCommand` 新增 `--executor cursor-sdk`
   - `project init` 的 `--executor` 参数扩展允许 `cursor-sdk`
   - 启动时验证：所选 executor 在 registry 中存在且 factory 成功构造

6. **[ ] 集成测试**
   - BDD 测试新增 `cursor-sdk` executor 场景（`test/bdd/`）
   - 确保任务完整生命周期（claim → execute → verify → review → done）通过
   - 验证 retry/heal 路径（SDK 无 NDJSON heal，但 last_error + prompt 重试仍有效）

### 风险与回退

- **SDK API 不稳定**：`CursorSdkExecutorPlugin` 作为独立 infrastructure 模块，损坏时不影响 OpenCode 路径
- **环境变量泄露**：SDK 调用在同一进程内，需确保 `AGENT_FARM_TASK_ID` 等 env 不对 SDK 产生副作用
- **回退方案**：`--executor opencode` 或移除 `--executor` 参数即回到当前行为

## M2 清单

- [ ] `src/application/worker/executor-plugin.ts` — `ExecutorPlugin` / `ExecutorPluginContext` / `ExecutorStageResult` 类型定义
- [ ] `src/application/worker/executor-registry.ts` — `ExecutorRegistry` 接口 + `Map` 实现 + 内置注册（opencode / shell）
- [ ] `src/application/worker/opencode-executor-plugin.ts` — `createOpencodeExecutorPlugin` 适配器 + 单测
- [ ] `src/application/worker/shell-executor-plugin.ts` — `createShellExecutorPlugin`（纯 shell，无 NDJSON） + 单测
- [ ] 修改 `src/application/worker/process-claimed-task/index.ts` — `ProcessClaimedTaskDeps` 新增 `executor?`，execute/verify stage 按 plugin 分发
- [ ] 修改 `src/application/facades/worker.ts` — `WorkerOptions` 新增 `executor?`，从 registry 解析并传入 `processClaimedTask`
- [ ] 修改 `src/interfaces/cli/register/worker.ts` — 新增 `--executor` CLI 参数
- [ ] 修改 `src/interfaces/cli/register/project.ts` — `project init --executor` 扩展可选值
- [ ] 修改 `src/bootstrap/container.ts` — 构造 registry + 注册内置 plugin + 注入 worker
- [ ] `src/infrastructure/cursor-sdk/probe.ts` — SDK 可用性探测（doctor 集成）
- [ ] `src/infrastructure/cursor-sdk/cursor-sdk-executor.ts` — `CursorSdkExecutorPlugin` spike
- [ ] BDD 测试：`openCode` executor 与 `shell` executor 回归；`cursor-sdk` executor 基本通路
- [ ] `npm run check` 通过（TypeScript 零 error）
- [ ] 更新 `docs/agents/README.md` 索引，添加 `adr-executor-plugin.md` 条目
