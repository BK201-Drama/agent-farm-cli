# Wave 粒度控制 & 多机协作 Plan

> 产出任务：`meta-self-iter-20260510-plan-merge-granularity`（plan 模式）
> 对照分支：`meta-self-iter-20260510-plan-merge-granularity`
> 不改代码，仅设计方案。

---

## 1. 背景与现状

### 1.1 当前 Wave 派活全链路

```
wave JSON (N 个 task)
  → scripts/enqueue-task-wave.mjs 逐条 queue add --task-json
  → 同一 SQLite 队列（一个 task 表）
  → worker --workers K 一次性 claim ≤K 条
  → Promise.allSettled 并行执行
  → 全部完成后 drain（连续 idle 循环退出）
```

**关键事实：**

- `src/application/facades/worker.ts:69-89` — 每次 claim K 条任务，全部并行 `Promise.allSettled`，不存在子波拆分。
- `scripts/enqueue-task-wave.mjs:79-95` — 一次性把所有 wave entry 入队，不设上限。
- `src/interfaces/cli/register/worker.ts:28` — `--workers` CLI 默认 2，但派活脚本写死为 4（`dispatch-batch.sh:54`, `dispatch-batch.mjs:87`）。
- `src/interfaces/cli/register/worker.ts:42` — `--drain-idle-loops` 默认 3，没有波次完成信号。
- `src/application/use-cases/task/claim-tasks.ts:16` — 认领标识 `hostname#pid`，同一 SQLite 多机不会抢同一任务。

### 1.2 "Already up to date." 的当前处理

- `src/infrastructure/git/merge-agent-farm-branch.ts:88-145` — `runMergeNoFf()` 只检查 exit code（0=成功，非0=失败+dirty-tree 探测），不解析 stdout 文本。
- `git merge --no-ff` 在 `Already up to date.` 时 **退出码为 0**，被静默归为一般成功，无专用事件或日志。
- 这意味着：**多机环境中，机器 A 先完成某分支 merge，机器 B 再尝试 merge 同一分支时，B 的 merge 输出 `Already up to date.`，exit 0，被当作普通成功**——行为正确但缺少可观测性。

### 1.3 自迭代任务的生成方式

- `test/fixtures/waves/meta-self-iter-20260510.json` — 当前自迭代 wave，7 个任务，**完全手工编写**。
- 任务 4（`impl-wave-draft-script`）描述的 `scripts/insights-to-wave-draft.mjs` **尚未实现**——即尚无自动从 insights/doctor 生成 wave 的能力。
- `README.md:86-92` 自迭代 playbook 中建议 "small waves (1-3 tasks)"，但无代码强制。

---

## 2. Wave 粒度控制需求

目标：在自迭代（以及一般派活）场景下，能够控制：
- **每波任务数**：一批 wave 入队多少条 task。
- **execute 并行度**：worker 一次 claim 多少条并行执行。
- **是否拆分多波**：一个 wave 文件是整体执行，还是拆成多个子波**顺序**执行（前一波全部完成再启动下一波）。

### 2.1 为什么需要控制粒度

| 场景 | 风险 | 粒度需求 |
|---|---|---|
| 自迭代改代码 | 多任务并行修改同一文件，产生合并冲突 | 减少每波并行度，或拆分多波顺序执行 |
| 自迭代改代码 | worker 并行度太高导致资源/API 限流 | 降低 execute 并行度 |
| 多机共享 SQLite | 机器 A 和 B 各 claim 一部分，工作负载不均衡 | 波次序列化确保一台机器完成一波 |
| 大型 wave（数十条） | 一次性入队后不可控 | 拆分成可观察、可中止的子波 |
| "Already up to date" | 多机 merge 时无感知 | 增加可观测事件，配合波次序列化确认 |

---

## 3. 设计选项

### 3.1 选项 A：`--wave-max-tasks`（dispatch 层面拆分入队）

**方案：** 在 dispatch 脚本（`agent-farm-dispatch-batch.sh` / `.mjs`）增加 `--wave-max-tasks N` 选项。当 wave 有 M > N 条任务时，先入队前 N 条，worker 跑完后 (drain) 再入队下一批 N 条，循环直到全部入队。

**修改点：**

| 文件 | 变更 |
|---|---|
| `scripts/agent-farm-dispatch-batch.sh` | 新增 `--wave-max-tasks` 参数，拆分 wave entries 后循环调用 worker |
| `scripts/agent-farm-dispatch-batch.mjs` | 同上（Node 版） |
| `scripts/enqueue-task-wave.mjs` | 可选：支持接收部分 entries（切片输入） |

**优点：**
- 不改核心引擎代码，仅改派活脚本
- worker 无需感知波次概念
- 利用现有 `--drain-idle-loops` 判断完成

**缺点：**
- 波间等待依赖 drain 检测（不够精确）
- 对已入队但尚未完成的波没有显式完成信号

**适用：** 简单场景，快速落地。

---

### 3.2 选项 B：Wave 文件声明 `batch_size` + 顺序 dispatch 脚本

**方案：** Wave JSON 顶层新增 `"batch_size": N` 元字段（可选，不存在时整波入队）。dispatch 脚本解析此字段，若存在则按 N 拆分入队+执行。

**示例 wave 格式：**

```json
{
  "meta": {
    "batch_size": 3,
    "max_concurrency": 2
  },
  "tasks": [
    { "task_id": "t1", "dedupe_key": "k1", "prompt": "..." },
    { "task_id": "t2", "dedupe_key": "k2", "prompt": "..." },
    { "task_id": "t3", "dedupe_key": "k3", "prompt": "..." },
    { "task_id": "t4", "dedupe_key": "k4", "prompt": "..." },
    { "task_id": "t5", "dedupe_key": "k5", "prompt": "..." }
  ]
}
```

**修改点：**

| 文件 | 变更 |
|---|---|
| Wave JSON schema | 支持 `{ meta: { batch_size?, max_concurrency? }, tasks: [...] }` 格式 |
| `scripts/enqueue-task-wave.mjs` | 解析 meta，记录 batch_size；提取 tasks 数组 |
| `scripts/agent-farm-dispatch-batch.mjs` | 若 batch_size 存在，按 batch_size 切片循环 dispatch |
| Worker CLI (`register/worker.ts`) | 可选：支持 `--batch-id` 等 wave 感知（用于日志区分） |

**优点：**
- 声明式，wave 作者可自描述粒度意图
- 同时控制 batch_size（横向切分）和 max_concurrency（纵向并行度）
- 向后兼容（无 meta 时行为不变）

**缺点：**
- 改变了 wave 文件 schema（需向后兼容旧数组格式）
- 实现工作量比选项 A 大

---

### 3.3 选项 C：Worker 内建批次队列

**方案：** Worker 内部维护一个批次队列，每次从 SQLite claim 任务后，不是全部并行执行，而是内部控制并发槽位。同时支持 "claim 完一波后，等该波全部完成再 claim 下一波" 的模式。

**核心逻辑变更（`src/application/facades/worker.ts`）：**

```
// 当前：一次 claim N，全部 Promise.allSettled
// 改为：
//   1. claim batch_size 条
//   2. 并发度不超过 max_concurrency → 用 semaphore/池控制
//   3. 该批全部完成后 → 再 claim 下一批（若任务仍存在）
//   4. 若无更多任务 → drain
```

**修改点：**

| 文件 | 变更 |
|---|---|
| `src/application/facades/worker.ts` | 重构 `runWorkerLoop()`：引入批次循环 + semaphore 并发控制 |
| `src/interfaces/cli/register/worker.ts` | 新增 `--batch-size` 和 `--max-concurrency` CLI 参数 |
| `src/domain/ports/worker-config.ts` | 扩展 `WorkerConfig` 接口 |

**优点：**
- 粒度控制内建在 worker 引擎，不依赖 dispatch 脚本
- 支持 "单机控制全部任务" 场景（不依赖 drain-loop 等待）

**缺点：**
- 改动核心引擎，风险高
- 与多机队列模型冲突：worker 按 batch 顺序 claim，但多机环境下其他 worker 可能在批次间隙抢走任务

---

### 3.4 选项 D：多波 Manifest 分发

**方案：** 不改变现有 wave 文件格式。新增 `wave-manifest.json` 概念（引用多个 wave 子文件），dispatch 脚本按 manifest 顺序依次执行每个子 wave。

```json
{
  "manifest": [
    "waves/01-init.json",
    "waves/02-implement.json",
    "waves/03-verify.json"
  ]
}
```

**修改点：**

| 文件 | 变更 |
|---|---|
| `scripts/agent-farm-dispatch-batch.mjs` | 支持 manifest 模式，顺序 dispatch 每个子 wave |
| `scripts/agent-farm-dispatch-batch.sh` | 同上 |

**优点：**
- 零侵入现有 wave 格式
- 明确顺序依赖关系
- 每个子波可独立观测、可独立重试

**缺点：**
- 管理更多文件
- manifest 不如选项 B 的声明式粒度直观

---

## 4. 推荐方案：B + 部分 C

### 4.1 推荐理由

| 需求 | 满足方式 |
|---|---|
| 每波任务数 | Wave `meta.batch_size` 声明（选项 B） |
| 单机 execute 并行度 | Worker `--max-concurrency` + semaphore（选项 C 的并发部分） |
| 拆分多波顺序执行 | Dispatch 脚本按 `batch_size` 切片循环 dispatch（选项 B） |
| 向后兼容 | `meta` 可选，不存在时行为无变化 |
| 多机协调 | 序列化 dispatch 保证同一波内任务仅在一台机器上运行（见 §5） |

### 4.2 Wave 文件新 Schema（兼容旧格式）

```typescript
// 旧格式（仍然支持）：TaskEntry[]
// 新格式：
interface WaveFile {
  meta?: {
    batch_size?: number;       // 每波入队条数，默认全部
    max_concurrency?: number;  // 每波最大并行度，默认 workers 值
    description?: string;      // 人类可读描述
  };
  tasks: TaskEntry[];          // 与旧格式相同
}
```

入队脚本 `enqueue-task-wave.mjs` 检测输入是数组还是对象，统一规范化为 `WaveFile`。

### 4.3 Dispatch 流程

```
1. 读取 wave 文件 → 解析为 WaveFile
2. batch_size = meta.batch_size ?? tasks.length
3. max_concurrency = meta.max_concurrency ?? 4
4. 将 tasks 按 batch_size 切片为 [[b1], [b2], ...]
5. for each batch:
     a. 将 batch 的每个 entry 通过 queue add --task-json 入队
     b. 启动 worker --workers <max_concurrency>
     c. 等待 worker drain（所有任务完成）
     d. 记录波次结果
     e. 若存在任何 blocked/failed 任务，可选中止后续波次
6. 完成后输出摘要
```

### 4.4 Worker 并发控制（轻量改造）

在 existing `runWorkerLoop()` 中，仅增加 semaphore：

```typescript
// worker.ts 中的变化（伪代码）
const semaphore = new Semaphore(maxConcurrency);
const promises = claimed.map(task => 
  semaphore.run(() => processTask(task))  // 不超过 max_concurrency 并发
);
await Promise.allSettled(promises);
```

不需要重构批次逻辑——批次拆分已在 dispatch 脚本完成。Worker 仅需控制每轮的并发度。

---

## 5. 与多机 "Already up to date." 的关系

### 5.1 多机场景分析

**场景 A：共享 SQLite，同波任务分属不同机器**

波次拆分 **之前**：
- 机器 A 和 B 共享同一 SQLite 队列
- Wave 有 7 个任务，worker --workers 4
- A claim 4 条，B claim 3 条
- 各自创建独立 worktree（不同 task_id → 不同分支）
- 各自 merge，互不干扰
- merge 都是 **不同分支**，不会出现 "Already up to date."

波次拆分 **之后**：
- dispatch 脚本在机器 A 上顺序入队+执行
- 机器 B 不参与（因为它没有拿到 dispatch 命令）
- 所有 batch 在机器 A 上完成
- 没有多机 "Already up to date." 问题

**场景 B：多机各自启动 worker，共享队列**

如果没有 dispatch 脚本的序列化控制，两台机器的 worker 各自 claim 任务：
- 问题：波次语义丢失（波 1 未完成，波 2 已被 claim）
- 解决方案：**不使用波次序列化时，batch_size 仍可限制单次 claim 数，但不保证波间顺序**

### 5.2 "Already up to date." 的可观测性改进

**问题：** 目前 `merge-agent-farm-branch.ts` 对 exit 0 不区分首次合并和 "Already up to date."

**改进（可选，轻量）：**

在 `runMergeNoFf()` 中增加 stdout 解析：

```typescript
// merge-agent-farm-branch.ts
const output = result.stdout + result.stderr;
if (output.includes("Already up to date")) {
  emit "task_merge_already_up_to_date"
} else {
  emit "task_merge_completed"
}
```

**影响分析：**
- 事件不同可帮助监控/诊断
- 不会改变合并行为
- 对等待后续波次的 dispatch 脚本：可以区分 "有实际合并" vs "已被合过"
- 配合波次序列化时，若出现 unexpected "Already up to date."，可发出告警（说明有外部进程干预了合并）

### 5.3 多机下的最佳实践

| 配置 | 适用场景 | 行为 |
|---|---|---|
| `batch_size=all, max_concurrency=4` | 单机，信任并行 | 一次入队全部，worker 4 并行 |
| `batch_size=3, max_concurrency=3` | 多机，保守 | 分批入队，每波 3 条，3 并发 |
| `batch_size=1, max_concurrency=1` | 调试/高风险改动 | 单个串行执行，逐任务观察 |

**推荐默认值：**
- 自迭代 wave：`batch_size=3, max_concurrency=3`
- 一般派活：不设 batch_size（即全部），`max_concurrency=4`（当前行为）

---

## 6. 与工作流 merge 的关系

### 6.1 波次拆分对 merge 的影响

**当前 merge 行为：**
- 每个任务完成后 → `commitWorktreeSnapshot()` → `mergeAgentFarmBranchSerialized()`
- 合并是 **串行** 的（`merge-agent-farm-branch.ts:277`，按完成时间排序）
- 一个 worker 进程内，同时最多有 K 个任务在运行，但 merge 是逐个进行的

**波次拆分后：**
- 每波任务完成后，该波的所有 merge 已经完成（因为 drain 等待所有任务完成）
- 下一波入队前，main 分支已经包含了上一波的所有变更
- 下一波创建的 worktree 基于更新后的 HEAD → 天然得到上一波的改动
- merge 顺序仍然是串行的，不同波之间不会有 merge 冲突

**关键保证：**
```
波 1 完成 → 所有 merge 完成 → HEAD 更新
  ↓
波 2 入队 → worktree 基于新 HEAD → 在新代码基础上改动
  ↓
波 2 完成 → merge → HEAD 再更新
```

这确保了自迭代场景下的语义完整性：前一波的代码改进会被后一波"看到"。

### 6.2 "Already up to date." 在此流程中的角色

在串行波次模式下，"Already up to date." 应该**极少出现**：
- 每波是新的 task_id + 新的 worktree 分支
- 每波的 merge 目标是"将本波的修改合并入 main"
- 唯一可能出现 "Already up to date." 的情况是：该波没有任何改动（snapshot commit 为空）
  → 此时可以安全跳过

建议：在波间完成后，若 merge 报告 "Already up to date."，dispatch 脚本记录日志但继续执行下一波。

---

## 7. 实现路线图

### Phase 1：最小可用（选项 B 的 schema + dispatch 逻辑）

| 步骤 | 文件 | 内容 |
|---|---|---|
| 1.1 | `scripts/enqueue-task-wave.mjs` | 支持 `WaveFile` 对象格式 + 旧数组格式，统一规范化 |
| 1.2 | `scripts/agent-farm-dispatch-batch.mjs` | 支持 `--wave-max-tasks` / `--batch-id` 参数，按 batch_size 循环 |
| 1.3 | `scripts/agent-farm-dispatch-batch.sh` | 同上（Bash 版） |
| 1.4 | `test/fixtures/waves/` | 新增 batched wave fixture |
| 1.5 | `test/waves/` | 新增 wave 拆分测试 |

### Phase 2：Worker 并发控制（选项 C 的并发部分）

| 步骤 | 文件 | 内容 |
|---|---|---|
| 2.1 | `src/interfaces/cli/register/worker.ts` | 新增 `--max-concurrency` CLI 参数 |
| 2.2 | `src/application/facades/worker.ts` | Semaphore 控制并行度 |

### Phase 3：可观测性增强

| 步骤 | 文件 | 内容 |
|---|---|---|
| 3.1 | `src/infrastructure/git/merge-agent-farm-branch.ts` | 检测 "Already up to date." 并 emit 专用事件 |
| 3.2 | `src/application/worker/process-claimed-task/events.ts` | 新增 `task_merge_already_up_to_date` 事件类型 |

### Phase 4：自迭代 task 生成（独立任务）

| 步骤 | 文件 | 内容 |
|---|---|---|
| 4.1 | `scripts/insights-to-wave-draft.mjs` | 实现从 `agent-farm insights`/`doctor` 输出生成 wave draft 脚本 |
| 4.2 | `src/application/use-cases/insights/` | 增强 insights 输出，提供结构化的可改进项列表 |

---

## 8. 风险与权衡

| 风险 | 缓解 |
|---|---|
| Wave schema 变更破坏现有派活流程 | 严格向后兼容：新格式用对象判断 `Array.isArray`，旧格式走旧路径 |
| 波间 drain 等待不准确（任务部分完成时 worker 提前退出） | drain idle loop 计数配合 `--drain-idle-loops`，推荐生产环境设为 5-10 |
| 多机共享 SQLite 时，一台 dispatch + worker，另一台也运行 worker 会干扰波次顺序 | 文档约定：多机模式下仅一台运行 dispatch 脚本；或增加 `--lock` 机制 |
| Semaphore 在 worker 内控制并发，但任务 claim 是"全量 claim"模式 | claim 时仍然一次取 `--workers` 条，只是执行时用 semaphore 限制并发。可选优化：claim 时也按 max_concurrency 限制数量 |
| 批次拆分增大了总耗时（波间串行） | trade-off：稳定性 vs 速度。由 wave 作者通过 batch_size 自行权衡 |

---

## 9. 决策总结

| 决策点 | 结论 |
|---|---|
| Wave 格式 | 扩展为 `{meta, tasks}` 对象格式，向后兼容数组 |
| 波次拆分 | dispatch 脚本按 `batch_size` 切片，顺序入队+执行 |
| 并行度控制 | Worker 增加 `--max-concurrency` + semaphore |
| 多机协调 | 波次序列化由 dispatch 脚本保证；不改变队列认领模型 |
| "Already up to date." | 轻量级检测 + 专用事件，不改变合并逻辑 |
| 默认值 | batch_size=all, max_concurrency=4（与当前行为完全一致） |

---

## 10. 示例：自迭代 Wave（带粒度控制）

```json
{
  "meta": {
    "batch_size": 3,
    "max_concurrency": 3,
    "description": "Self-iteration: plan merge granularity + related improvements"
  },
  "tasks": [
    {
      "task_id": "meta-self-iter-20260510-doc-verify-ai-review",
      "dedupe_key": "meta-self-iter-20260510-doc-verify-ai-review",
      "prompt": "Document the verify/ai-review stage behavior...",
      "mode": "execute",
      "priority": 3
    },
    {
      "task_id": "meta-self-iter-20260510-fixture-wave-verify",
      "dedupe_key": "meta-self-iter-20260510-fixture-wave-verify",
      "prompt": "Create example wave with verify feature...",
      "mode": "execute",
      "priority": 2
    },
    {
      "task_id": "meta-self-iter-20260510-design-insights-to-wave",
      "dedupe_key": "meta-self-iter-20260510-design-insights-to-wave",
      "prompt": "Design the insights-to-wave-draft script...",
      "mode": "plan",
      "priority": 2
    },
    {
      "task_id": "meta-self-iter-20260510-impl-wave-draft-script",
      "dedupe_key": "meta-self-iter-20260510-impl-wave-draft-script",
      "prompt": "Implement scripts/insights-to-wave-draft.mjs...",
      "mode": "execute",
      "priority": 2
    },
    {
      "task_id": "meta-self-iter-20260510-readme-self-iter-playbook",
      "dedupe_key": "meta-self-iter-20260510-readme-self-iter-playbook",
      "prompt": "Update README with self-iteration playbook...",
      "mode": "execute",
      "priority": 3
    },
    {
      "task_id": "meta-self-iter-20260510-agents-wave-authoring",
      "dedupe_key": "meta-self-iter-20260510-agents-wave-authoring",
      "prompt": "Add wave authoring doc to AGENTS.md...",
      "mode": "execute",
      "priority": 2
    },
    {
      "task_id": "meta-self-iter-20260510-plan-merge-granularity",
      "dedupe_key": "meta-self-iter-20260510-plan-merge-granularity",
      "prompt": "Design wave granularity control plan...",
      "mode": "plan",
      "priority": 1
    }
  ]
}
```

**执行效果：**
- batch_size=3 + 7 tasks → 3 个子波（3+3+1）
- 波 1 执行前 3 个任务（3 并发），完成后 merge → 波 2 基于新 HEAD 执行接下来 3 个 → 波 3 执行最后 1 个
- 总耗时≈ 3 次 worker 循环，但每波仅同时改动 3 个文件，降低 merge 冲突概率
