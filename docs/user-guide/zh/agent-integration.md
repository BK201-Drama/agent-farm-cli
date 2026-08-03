# 与自有 Agent 集成

> 从根目录 README 迁入；与 [英文版](../en/agent-integration.md) 对应。

核心在 `--command-template`：

```bash
agent-farm worker \
  --workers 3 \
  --command-template 'your-agent-cli run --task-id {task_id} --prompt {prompt} --out {runs_dir}' \
  --lease-timeout-seconds 1800 \
  --poison-max-attempts 3
```

占位符：

- `{task_id}`
- `{prompt}`
- `{runs_dir}`
- `{workspace}`（任务执行目录：**默认**每条任务为独立 git worktree 检出；`--shared-workspace` 时与 `--workspace` 相同）
- `{acceptance_criteria}`（来自任务字段 `acceptance_criteria`，JSON 转义后嵌入命令）
- `{git_diff}`（`git diff` 输出，优先对 remote 默认分支做 `...HEAD` 对比，失败退化为 `HEAD~1`；非 git 目录或命令失败则为空字符串；JSON 转义嵌入，上限 100k 字符，超出截断并追加 `[... truncated ...]` 标记）
- `{git_diff_name_status}`（`git diff --name-status` 输出（换行分隔），对比策略与上限同上；`--name-status` 上限 50k 字符；非 git 目录或命令失败则为空字符串）

环境变量（子进程均可读）：`AGENT_FARM_TASK_ID`、`AGENT_FARM_RUNS_DIR`、`AGENT_FARM_WORKSPACE`（执行器 `--dir` / 改代码目录）、`AGENT_FARM_WORKSPACE_ROOT`（仓库根，含 `node_modules/.bin`，给 `npx --prefix` 用）、`AGENT_FARM_PROMPT`；启用 worktree 时另有 `AGENT_FARM_WORKTREE_BRANCH`（`agent-farm/<task-id>`）。

## Git worktree 真并行（多任务同时改仓库）

**默认开启**：`agent-farm worker` 会为每条任务在 **`<repo>/.agent-farm/worktrees/<task-id>`** 单独检出，并创建分支 **`agent-farm/<task-id>`**（起点为当前 `HEAD` 的干净树；不含主工作区未提交改动）。任务结束后目录会删掉，**分支保留**，便于在主仓库 `git merge` 或检视。这样 **`--workers` > 1** 时各任务不会抢同一工作区文件。

- 要求：`--workspace` 在 **git 仓库**内，且本机可用 `git`。
- **关闭 worktree**（共用同一检出目录）：传 **`--shared-workspace`**，或派活脚本里设 **`AGENT_FARM_GIT_WORKTREE=0`** / **`false`**。
- OpenCode 模板须区分前缀与工作目录，例如：  
  `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}`（本仓库自带 dispatch 脚本已按此写法）。
- worktree 内默认**无**主目录的 `node_modules`（若未提交），需在命令模板里对 worktree 执行 `npm ci` / `pnpm install` 等，或仅用 `WORKSPACE_ROOT` 调 `npx`。
- **任务结束后 `.agent-farm/worktrees/<id>` 会消失**是正常现象：worker 会 `git worktree remove` 释放目录，**提交仍在本地分支 `agent-farm/<id>`**；用 `git branch` 查看。
- **拆除 worktree 前默认做 snapshot commit**：先 `git add -A`（常规未 ignore 变更），再**默认**对存在时的 **`.agent-farm/runs`** 执行 **`git add -f`**，避免产出只写在 ignore 的 runs 里却进不了提交；关闭：**`AGENT_FARM_WORKTREE_SNAPSHOT_SKIP_RUNS=1`**。其它仍被 ignore 的路径用 **`AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD`**（逗号/分号/竖线分隔，相对 worktree 根，逐个 `git add -f`）；若仅有 ignore 内文件且既未命中 runs 也未配置 FORCE_ADD，会**提交失败并保留 worktree**，stderr/事件里带提示。提交默认 **`--no-verify`**；若要让 hook 运行则设 **`AGENT_FARM_GIT_COMMIT_VERIFY=1`**。作者默认 **`agent-farm` / `agent-farm@local`**，可用 **`AGENT_FARM_GIT_COMMITTER_NAME`**、**`AGENT_FARM_GIT_COMMITTER_EMAIL`** 覆盖。成功会写 **`task_worktree_snapshot_committed`**；失败则**不删除 worktree**，并写 **`task_worktree_snapshot_failed`**。整体关闭 snapshot：**`AGENT_FARM_WORKTREE_SNAPSHOT=0`**。
- **自动合并进当前分支**：在 snapshot 之后执行。`agent-farm worker --auto-merge`（或 `AGENT_FARM_AUTO_MERGE=1`）。任务在 **自动 approve 并标记 done** 后，会在仓库根把对应 `agent-farm/<id>` **串行** `git merge --no-ff` 进**此时主工作区已检出的分支**。若 Git 因**未提交改动**拒绝合并，默认会先 **`git stash push -u`**，合并成功后再 **`git stash pop`** 尽量恢复现场；`pop` 若冲突会记 **`task_merge_failed`** 并需你手动解决。关闭该行为（恢复为「脏树直接 merge 失败」）：**`AGENT_FARM_AUTO_MERGE_STASH=0`**。其它合并失败（真冲突等）仍写 **`task_merge_failed`**。Wave 脚本默认开启合并，可用 **`AGENT_FARM_AUTO_MERGE=0`** 关闭。使用 **`--no-auto-approve-review`** 时不会走 done 自动合并路径，需自行合并。
- **自动合并排错**：出现 `task_merge_failed` 时，先 `agent-farm doctor` 快速定位失败任务与原因；`agent-farm queue list --status failed` 可查看所有失败任务。若由 stash pop 冲突（脏工作区未提交改动与合入内容冲突）导致，`git stash list` 查看未恢复的 stash，手动 `git stash pop` 解决冲突后 `git reset HEAD` 清理暂存，最后用 `agent-farm queue update <id> --status done` 手动标记。其他真合并冲突可 `git merge --abort` 后手动 cherry-pick 或 merge 再标记。
- **合并冲突 / task_merge_failed 恢复步骤**：① `git status` 确认当前分支与冲突状态；② 解决冲突后 `git add -A && git merge --continue`，或放弃合并：`git merge --abort`（若有未恢复 stash 先 `git stash pop` 解决）；③ 若队列任务卡在 `running`：`agent-farm queue recover-stale --lease-timeout-seconds 1800`；④ 重新启动 worker（wave 脚本或直接 `agent-farm worker ...`）。关闭自动合并避免干扰：`AGENT_FARM_AUTO_MERGE=0`。

## OpenCode NDJSON 可观测与自愈（`run --format json`）

- 开启：**`agent-farm worker --opencode-json-events`**，或在 `.agent-farm/profile.env` 中设置 **`AGENT_FARM_OPENCODE_JSON_EVENTS=1`**。
- worker 会在常见模板里为 **`opencode-ai run`** 自动插入 **`--format json`**（若尚未指定），并对 **stdout/stderr 按行** 尝试解析 JSON；**execute / verify / ai-review** 三阶段里，只要展开后的命令包含 **`opencode-ai run`** 即启用同一套观察器。阶段失败时写入 **`task_opencode_stream_diag`**（带 **`stage`**：`execute` | `verify` | `ai_review`），并在 **`retry`** 时更新 **`prompt`**：**execute/verify** 追加 **`[opencode-heal]`**；**ai-review** 在 **`[ai-review-fix]`** 之后视情况再追加 **`[opencode-heal]`**（并与上一轮附加互斥去重）。
- 事件 schema 随 `opencode-ai` 版本可能变化，解析为**宽松模式**。
- **`agent-farm doctor`**：JSON 中带 **`opencode_cli`**（本机 `opencode-ai run --help` 是否像支持 `--format json`）、队列中 **`tasks_with_opencode_heal_prompt`**、以及近期 **`task_opencode_stream_diag`** 计数与按 **`stage`** 聚合（需可访问 event 存储；sqlite/jsonl 均已接好）。

## Codex CLI NDJSON（`--codex-json-events`）

- Preset：`codex exec --json --ephemeral --skip-git-repo-check --sandbox danger-full-access {prompt}`（`project init --executor codex`）。
- 开启：**`agent-farm worker --codex-json-events`** 或 **`AGENT_FARM_CODEX_JSON_EVENTS=1`**。失败重试可注入 **`[codex-heal]`**。鉴权用本机 `codex login` 或 **`CODEX_API_KEY`**；勿默认隔离 `CODEX_HOME`。

## Cursor Agent CLI headless（`--cursor-agent-json-events`）

- Preset：`agent -p --force --trust --output-format stream-json {prompt}`（`--executor cursor-agent`；别名 `agent`）。
- 开启：**`--cursor-agent-json-events`** 或 **`AGENT_FARM_CURSOR_AGENT_JSON_EVENTS=1`**。失败重试可注入 **`[cursor-agent-heal]`**。鉴权：**`CURSOR_API_KEY`** 或 `agent login`；Windows 常见安装路径 `%LOCALAPPDATA%\cursor-agent`。
- 与 **`cursor-sdk`**（`AGENT_FARM_EXECUTOR=cursor-sdk`，无 shell template）不同：本预设走 **Cursor Agent CLI**。

## 机器可判定验收（verify 阶段）

worker 的三阶段管线为 **execute → verify → ai-review → review**。其中 **verify** 是**确定性**验收（需外部工具给出明确 0/非 0），通过 `--verify-command-template` 配置，并在展开时复用所有命令模板占位符（包括 `{acceptance_criteria}`）：

```bash
agent-farm worker \
  --workers 3 \
  --command-template 'your-agent {prompt}' \
  --verify-command-template 'npm test && npm run lint'
```

- `--verify-command-template`：execute 成功后执行（exit 0 才进下一阶段）；失败则进入 `retry`。
- 支持 `{acceptance_criteria}` 占位符——来自**任务字段** `acceptance_criteria`，JSON 转义后嵌入。可把简单验收要点写在 wave JSON 里，由 verify 脚本消费。
- 未配置 verify 模板时**自动跳过**该阶段（视为通过）。
- 与 `mode` / `priority` 的关系：
  - `mode`（`"plan"` | `"execute"`）：plan 模式同样走完整管线；approve 后可派生 execute 子任务。在 **wave JSON** 中按需填入。
  - `priority`（数值，越大越优先被 claim）：仅影响排队取用顺序；不改变管线行为。在 **wave JSON** 中默认 0。
- Wave JSON 里可写的完整字段（与 `queue add --task-json` 一致）：`task_id`、`dedupe_key`、`prompt`（必填）；`mode`、`priority`、`acceptance_criteria`、`skip_ai_review`、`execute_command_template`、`verify_command_template`、`ai_review_command_template`（可选；后三项非空时**分别覆盖** worker 的 `--command-template` / `--verify-command-template` / `--ai-review-command-template`，仅作用于该任务）。**JSON Schema**：`schemas/wave-task-item.schema.json`；字段与退出码约定见 **`docs/harness-contracts.md`**。带验收的 wave 最小示例：

```json
[
  {
    "task_id": "feat-login",
    "dedupe_key": "feat-login",
    "mode": "execute",
    "priority": 5,
    "prompt": "实现登录功能并确保测试通过",
    "acceptance_criteria": "npm test 全部通过；无 ESLint 错误"
  }
]
```

## AI / 语义验收（每条 task）

适合 diff 量大、人看不完的场景：在 **确定性 verify**（测试/lint）之后，再跑一道 **验收命令**（通常内部再调 LLM 或专用脚本）。`exit 0` 才进入 `review`。

```bash
agent-farm worker \
  --workers 2 \
  --workspace . \
  --command-template 'your-agent {prompt}' \
  --verify-command-template 'npm test' \
  --ai-review-command-template 'bash scripts/ai-review.example.sh' \
  --require-ai-review
```

Windows 环境将最后一行换成：

```cmd
  --ai-review-command-template "scripts\ai-review.example.cmd" \
```

- **`--ai-review-command-template`**：全局默认验收命令；可用任务字段 **`ai_review_command_template`** 按任务覆盖。
- **`--require-ai-review`**：除 **`skip_ai_review: true`** 的任务外，必须有模板，否则任务 **`blocked`**（防止漏验收）。
- **失败重试**：验收非 0 时进入 `retry`，并在 `prompt` 末尾追加 **`[ai-review-fix]`** + 验收输出，便于执行 agent 针对性修改。

仓库内 stub：`scripts/ai-review.example.sh`（Linux/macOS）和 `scripts/ai-review.example.cmd`（Windows）；复制到项目中再改成真实验收逻辑。两个脚本等价，仅根据运行平台选用。

### 结构化 verdict（机器可读验收结论）

当验收脚本在 **合并 stdout 最后一行非空行** 输出如下单行 JSON 时，worker 以 verdict 为准判定阶段成败，**不再依据进程 exit code**：

```json
{ "verdict": "pass" }
```

或

```json
{ "verdict": "fail", "reason": "……" }
```

- **`"pass"`** → 阶段成功（视同通过），即便 exit code 非 0。
- **`"fail"`** → 阶段失败，进入现有 retry 流程（与 exit code 非 0 一致）。若带 `reason` 字段，会并入 `last_error` 和 `[ai-review-fix]` 块（受 `AI_REVIEW_ERROR_CAP` / `AI_REVIEW_FIX_PROMPT_APPEND_CAP` 截断）。
- **不存在**上述 JSON 行时，行为与现版完全一致：**仅依据进程 exit code**（0 通过，非 0 失败）。
- JSON 大小写不敏感（`PASS`/`FAIL` 均接受）；解析忽略尾部空白，前面可有其它日志行；解析失败回退 exit-code-only。

## 执行器解耦（重要）

调度层并不绑定某个模型工具。你可以在 `project init` 时选择：

- `--executor auto`（默认，自动探测）
- `--executor opencode`
- `--executor codex`
- `--executor claude`

也可以完全自定义：

```bash
agent-farm project init \
  --target-dir . \
  --executor-command 'your-runner --task {task_id} --prompt {prompt}'
```

只要你的命令模板支持 `{prompt}`（可选 `{task_id}`/`{runs_dir}`），就能接入。

默认 `auto` 行为：

1. `project init` 时会先探测本机可用执行器（优先级：`opencode -> codex -> claude`）。
2. 生成的 `scripts/agent-farm-dispatch.sh` 运行时也会再次探测，避免环境变化导致失效。

推荐先安装 Skill，让 Cursor Agent 默认知道何时走并行调度：

```bash
agent-farm skill install --target-dir .
```

更推荐直接使用一键初始化：

```bash
agent-farm project init --target-dir .
```

然后用脚本调度：

```bash
./scripts/agent-farm-dispatch.sh "你的任务描述"
```

→ [用户指南索引](../README.md) · 上一章：[cursor-data-state.md](./cursor-data-state.md) · 下一章：[faq-publish-architecture.md](./faq-publish-architecture.md)
