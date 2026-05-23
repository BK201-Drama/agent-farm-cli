# GitHub Actions：定时巡检 + 失败开 issue

本文说明如何在仓库中使用 **agent-farm** 做轻量「健康巡检」：**全绿静默**，**doctor 判定不健康时** 自动开/跟帖 **issue**（需 `issues: write`）。

## 前置

- 仓库已 `project init` 或已有 `.agent-farm/queue`（与本地一致）。
- 默认使用 **sqlite** 时，CI 里建议保留本包的 `postinstall` / `AGENT_FARM_SKIP_SQLITE_REBUILD` 等既有约定（见根目录 CI）。

## `doctor --ci-exit`

`agent-farm doctor --ci-exit` 在打印 **完整 JSON** 后，若存在下列任一情况则 **退出码 1**（并往 stderr 写简短原因）：

- `ok: false`（例如队列读失败）
- `duplicate_dedupe_keys_count > 0`
- `stale_running_count > 0`
- `heartbeat_missing_count > 0`
- `review_overdue_count > 0`
- 存储为 **sqlite** 且 **better-sqlite3 探针失败**

**不包含**：orphan worktrees、OpenCode 探针失败（避免开发机噪声进 CI）。

与 **`--brief` 互斥**（CI 需要完整 JSON 路径时可配合 `--output-file`）。

### 规则速查表

| 条件                                            | CI 失败 |
| ----------------------------------------------- | ------- |
| `ok: false`                                     | 是      |
| 活跃任务 `dedupe_key` 重复                      | 是      |
| `running` 超过租约（`--lease-timeout-seconds`） | 是      |
| `review` 超过 `--review-overdue-hours`          | 是      |
| 有 `heartbeat_at` 但无 `claimed_by`             | 是      |
| sqlite 存储且 better-sqlite3 探针失败           | 是      |
| orphan worktrees / OpenCode 探针                | 否      |

合并 **PR #2** 后请定期在默认分支执行 **workflow_dispatch** 或等待周一 cron；示例 wave 变更后跑 **`npm run validate:waves`**。

## 本仓库自带 workflow

见 **`.github/workflows/agent-farm-health-cron.yml`**：每周一 12:00 UTC 运行；`workflow_dispatch` 可手动触发。同 job 在 **`doctor --ci-exit`** 之后运行 **`insights --output-file agent-farm-insights-ci.json`**，并以 **artifact** 上传（`if: always()`，便于 doctor 失败时仍保留快照）。失败时由 `github-script` 维护标题为 **`[agent-farm] Health check failed`** 的 issue（已存在则追加评论）。

多根目录：在 workflow 的 **`matrix.workspace`** 中增加路径，并保证各路径下能解析队列（或设置 `working-directory` 与 `AGENT_FARM_*` 环境变量）；第一版默认仅 **`.`**。

### 权限与排错

- Workflow 需 **`permissions: issues: write`**（本仓库 workflow 已声明）；组织若禁用 `GITHUB_TOKEN` 写 issue，失败步骤会报错且**不会**开 issue——请在仓库 **Settings → Actions → General → Workflow permissions** 选 **Read and write**，或改用 PAT。
- 本地等价巡检：**`npm run ci:health:local`**（clone 本仓库后，无需 GitHub）。
- **insights** 步骤在本仓库 workflow 上为 **`continue-on-error: true`**：doctor 失败时仍尽量保留 insights artifact；仅 doctor 失败会开 issue。

### 消费者仓库最小 workflow

`project init` 默认写入 **`.github/workflows/agent-farm-health.yml`**（精简版）。亦可从下列片段起步（需已 `project init` 且能解析 `.agent-farm/queue`）：

```yaml
# 见 generateConsumerHealthWorkflowYaml / docs/integrations 全文
- run: npx agent-farm doctor --ci-exit
  env:
    AGENT_FARM_SKIP_OPENCODE_PROBE: "1"
```

多 workspace 矩阵示例（占位，第二项需自备队列路径）：

```yaml
strategy:
  matrix:
    workspace: [".", "packages/foo"] # 第二项延后启用
defaults:
  run:
    working-directory: ${{ matrix.workspace }}
```

---

# GitHub Actions: scheduled patrol + issue on failure

This document describes using **agent-farm** for a lightweight health patrol: **silent on success**, and **open/update an issue** when **`doctor --ci-exit`** fails (requires `issues: write`).

## Prerequisite

Your repo already has `.agent-farm/queue` (same layout as local `project init`).

## `doctor --ci-exit`

After printing the **full JSON** report, `agent-farm doctor --ci-exit` exits **1** if any CI-relevant problem is detected (reasons are printed to stderr). See the Chinese section above for the exact rule list.

**Incompatible with `--brief`**. You may add `--output-file` for artifacts.

## Workflow in this repository

See **`.github/workflows/agent-farm-health-cron.yml`**. The job runs **`insights --output-file`** and uploads an **artifact** (`if: always()`). Extend **`matrix.workspace`** for multiple checkouts once each workspace resolves the queue paths correctly.

**Permissions**: the workflow needs **`issues: write`**. If your org restricts `GITHUB_TOKEN`, enable **Read and write** workflow permissions or use a PAT. Local parity: **`npm run ci:health:local`** in a clone.

## Demo task (local)

```bash
agent-farm demo task --template noop
# or (runs npm run check twice in the worker pipeline)
agent-farm demo task --template check
```

Tasks use **`demo-onboarding-*`** ids/dedupe keys. Cancel/update via `agent-farm queue update` when finished.
