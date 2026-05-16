# agent-farm-cli

面向任意 agent 系统的 **Node.js CLI**：队列并行、Plan/Review、租约恢复、poison 隔离、`insights` / `doctor` 可观测，以及可选的 **AI 语义验收**（execute / verify 之后的独立命令，失败注入 `[ai-review-fix]`）。

## 文档（渐进式）

| 读者 | 入口 |
|------|------|
| 中文 | **[用户指南索引 `docs/user-guide/README.md`](docs/user-guide/README.md)**（分章：安装、dogfood/Wave、Cursor/状态机、集成、FAQ/架构） |
| English | **[User guide index `docs/user-guide/README.md`](docs/user-guide/README.md)**（paired `docs/user-guide/en/*.md`） |
| 协作与 wave 规范 | [`docs/agents/README.md`](docs/agents/README.md) |
| 个人 → 团队 → CI（5 分钟 + 验收） | [`docs/roadmap-one-week-personal-team-ci.md`](docs/roadmap-one-week-personal-team-ci.md) · [中文 5 分钟清单](docs/user-guide/zh/install-quickstart-commands.md#个人-5-分钟首次上手) |
| 任务 JSON / CLI 契约 | [`docs/harness-contracts.md`](docs/harness-contracts.md) |

## 安装

```bash
npm i -g github:BK201-Drama/agent-farm-cli
# 或本地：npm install && npm run build && npm link
```

```bash
agent-farm --help
```

## 最短路径（3 步）

```bash
agent-farm queue add --prompt "实现登录接口" --task-id t1 --dedupe-key auth-login
agent-farm worker --workers 2 --command-template 'echo {prompt}'
agent-farm doctor
```

接入新项目：

```bash
agent-farm project init --target-dir .
./scripts/agent-farm-dispatch.sh "你的任务描述"
```

**Windows** 单条派活：`npm run farm:dispatch:node -- "…"`（在**本仓库**内开发时）。更多命令与子命令说明见 **[用户指南 · 安装与命令](docs/user-guide/zh/install-quickstart-commands.md)** / **[English](docs/user-guide/en/install-quickstart-commands.md)**。

## 设计目标（一句话版）

可移植、可并行、可恢复、可治理 — 展开见用户指南。

## 变更日志与协议

- [CHANGELOG.md](./CHANGELOG.md)
- License: **MIT**

---

**勿将** execute / verify / ai-review **长输出**接到 `head` / `tail` / `wc` 等截断管道，否则子进程可能 **SIGPIPE**（详见用户指南 dogfood 章节）。
