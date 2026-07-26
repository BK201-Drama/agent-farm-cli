## 方向 C · 自愈 — 实现完成

### 改动摘要

#### 1. 移除 `AGENT_FARM_SKIP_AUTO_RECOVERY`（自动 lease recovery）
- `src/bootstrap/default-storage-container.ts` — 容器创建时始终执行 `recoverStale` + `quarantinePoison`
- `src/application/facades/control-plane.ts` — 控制平面也始终自动恢复
- `CLAUDE.md` — 移除旧 env var 文档，添加新的自愈配置文档
- 自愈默认开启，worker 进程被 kill 后下次 tick 自动回收过期租约

#### 2. Poison 自动隔离 + 降级重试
新文件：
- `src/application/self-healing/config.ts` — 自愈配置解析（env `AGENT_FARM_SELF_HEALING_*` > project config）
- `src/application/self-healing/degradation.ts` — 降级策略引擎：换模型 → 降级 prompt → 纯重试 → 耗尽后 blocked
- `src/application/self-healing/service.ts` — 自愈编排服务（租约回收 + poison 扫描 + 降级 + 隔离）
- `src/application/self-healing/index.ts` — barrel export

修改：
- `src/application/contracts/agent-farm-project-config.ts` — 新增 `AgentFarmSelfHealingConfig` 类型
- `src/application/facades/worker.ts` — 集成 `SelfHealingService` 到 worker loop 的 `onTick`，替换原始 `recoverStale` 调用

#### 3. 空转静默处理增强
- `src/application/worker/empty-run-action.ts` — 多级降级策略：
  - Level 0: 注入 `[empty-run-fix]` 提示（保持向后兼容）
  - Level 1: 切换备选模型（如果配置了 `degradation_models`）
  - Level 2+: 降级 prompt 注入 `[self-healing]`
  - 所有策略耗尽后才标记 `failed`
  - 新增 `empty_run_max_retries` 配置

#### 4. Doctor 降级为诊断工具
- `src/application/facades/doctor.ts` — 新增 `self_healing` 统计段：recovered/degraded/quarantined/exhausted 计数 + 近期自愈动作
- `src/interfaces/cli/register/doctor-action.ts` — `--brief` 输出显示自愈诊断信息
- `src/interfaces/cli/register/doctor.ts` — 添加 `description` 标注为"diagnostic report (read-only, no repair)"

### 配置

| 变量 | 默认 | 说明 |
|------|------|------|
| `AGENT_FARM_SELF_HEALING_MAX_RETRIES` | `3` | 达到后进入 poison 降级 |
| `AGENT_FARM_SELF_HEALING_DEGRADATION_MODEL` | — | 逗号分隔备选模型列表 |
| `AGENT_FARM_SELF_HEALING_TIMEOUT_MINUTES` | `30` | 单次降级尝试最长等待 |
| `AGENT_FARM_SELF_HEALING_EMPTY_RUN_MAX_RETRIES` | `2` | 空转最大自动重试次数 |

Project config (`.agent-farm/config.json`):
```json
{
  "self_healing": {
    "max_retries": 3,
    "degradation_models": ["gpt-4o", "claude-sonnet-5"],
    "timeout_minutes": 30,
    "empty_run_max_retries": 2
  }
}
```

### 测试
- 全部 687 测试通过，0 失败
- 更新了 3 个测试以适配自愈默认开启的新行为
- 未改 domain 模型（constraint 满足）
