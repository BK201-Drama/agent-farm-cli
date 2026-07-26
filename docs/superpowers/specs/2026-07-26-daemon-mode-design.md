# Daemon Mode Design

## Context

OPC-12 (方向 B · 环境驻留) — 将 agent-farm-cli 从"显式命令启 worker"演进为"后台 daemon 自动消费"。本 spec 覆盖第一版：CLI-only daemon，不做开机自启、不做 system tray。

## Architecture

新增 4 个文件，不改现有核心逻辑：

```
src/
├── application/facades/daemon.ts          # Daemon 生命周期管理
├── infrastructure/daemon/
│   ├── pid-file.ts                         # PID 文件读写
│   ├── daemon-state.ts                     # daemon 运行状态（JSON）
│   └── windows-notify.ts                   # Windows toast 通知
└── interfaces/cli/register/daemon.ts       # CLI 命令注册
```

**数据流：** `agent-farm daemon start` → 写 PID + state → fork 子进程运行 `runWorkerLoop`（drainIdleLoops=0）→ 父进程退出。子进程通过事件钩子触发 Windows toast 通知。

## Commands

### `daemon start [--workers <n>] [--workspace <path>]`

- 检查 `.agent-farm/daemon.pid` 是否已存活 → 已运行则报错
- 写入 PID + state 文件
- `child_process.fork` 启动子进程，复用 `runWorkerLoop`，drainIdleLoops=0
- 父进程打印 "daemon started (PID xxx)" 后退出

### `daemon stop`

- 读 PID → SIGTERM → 等 5s → SIGKILL
- 清理 PID + state 文件

### `daemon status [--brief]`

- 检查 PID 存活 → running / stopped / crashed
- 复用 StatusService 显示队列概况
- `--brief`：一行摘要

## Notifications

Windows toast 通过 PowerShell 调用，失败静默降级。

| 事件 | 内容 |
|------|------|
| task done | ✅ task done: `<task_id>` |
| task failed | ❌ task failed: `<last_error>` |
| task stuck/blocked | ⚠️ task stuck: needs decision |
| daemon idle (N 轮空转) | 💤 daemon idle（限频，10 分钟一次） |

去重：同一 task_id + 状态 5 分钟内不重复。

## Constraints

- Windows only，不引入第三方 GUI 依赖
- 不碰注册表
- daemon 崩溃不影响 SQLite 队列数据
- 复用现有 `runWorkerLoop`，不重复实现消费逻辑
