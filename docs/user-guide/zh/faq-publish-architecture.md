# 常见问题、发布与源码布局

> 从根目录 README 迁入；与 [英文版](../en/faq-publish-architecture.md) 对应。

## 常见问题

- **Q: 为什么任务不执行？**
  - 先看 `agent-farm doctor`，检查是否卡在 `review` 或被隔离。
- **Q: 为什么同类任务加不进去？**
  - 命中了 `dedupe_key` 防重，换 key 或先处理已有任务。
- **Q: 如何覆盖重装 skill/脚本？**
  - `agent-farm project init --target-dir . --force`
- **Q: 如何确认接入完成？**
  - 检查三个路径：
    - `.agent-farm/queue/`
    - `.cursor/skills/agent-farm-dispatch/SKILL.md`
    - `scripts/agent-farm-dispatch.sh`

## 发布到 npm

**0.1.42+** 起 npm 包 `files` 含 **`examples/`**（如 `examples/waves/team-handoff-min.json`）。`ci:health:local` 为**本仓库开发脚本**；消费者仓库请用 `agent-farm doctor --ci-exit` 或 `project init` 生成的 `.github/workflows/agent-farm-health.yml`。

当前仓库已支持 npm 包结构（`bin: agent-farm`）。发布步骤：

```bash
npm adduser
npm run build
npm publish --access public
```

如果包名冲突，建议改为 scope 名称（例如 `@bk201/agent-farm-cli`）。

本仓库亦提供 `npm run release`（见 `scripts/release.mjs`）。

### 发布前检查（0.1.42+）

- [ ] `npm run check && npm test && npm run test:bdd && npm run validate:waves`
- [ ] `npm run build && npm run ci:health:local`
- [ ] CHANGELOG 与 `package.json` 版本一致
- [ ] 未将 `.agent-farm/queue` 运行数据打入 `files`

## 目录架构（SOLID + Ports/Adapters）

- `src/domain/ports/`：领域出站端口（仓储、时钟、Shell 等接口）
- `src/domain/task/`：任务限界上下文——`model`（类型与状态常量）、`transitions`（状态机）、`enqueue`（入队/去重）、`board`（claim/租约回收/毒任务拆分）；根目录 `task.ts`/`event.ts` 为聚合导出
- `src/application/use-cases/task/`：任务队列相关用例（与 `domain/task/` 词汇对齐）；`use-cases/project/`：项目初始化用例及配套预设/环境枚举
- `src/application/facades/`：应用门面（`QueueService` 等）；`facades/worker.ts` 为 worker 循环入口
- `src/application/contracts/`：应用层契约（非领域端口），如 `ClaimedTaskCommands`、`ProjectInitGateway`——由门面或基础设施实现，避免与 `domain/ports/` 混淆
- `src/interfaces/cli/`：命令行适配器；子命令注册在 `cli/register/`
- `src/domain/`：领域模型与策略（`task.ts`/`event.ts` 聚合、`domain/task/*`、`domain/event/*`、`domain/ports/`）
- `src/infrastructure/persistence/jsonl/`、`sqlite/`：仓储适配器实现（JSONL / SQLite）
- `src/bootstrap/`：依赖装配（container）

推荐目录树：

```text
src/
  interfaces/
    cli/
      index.ts
      tui/
        task-dashboard/
          app.tsx
          index.tsx
          helpers/
          hooks/
            dashboard-nav/
      register/
        index.ts
        dashboard.ts
        queue/
          index.ts
          …
  application/
    contracts/
      claimed-task-commands.ts
      project-init-gateway.ts
    use-cases/
      task/
        add-task.ts
        claim-tasks.ts
      project/
        init-project.ts
        dev-environment.ts
        executor-presets.ts
    facades/
      queue.ts
      worker.ts
      insights.ts
      doctor.ts
    worker/
      process-claimed-task/
        index.ts
        context.ts
        events.ts
        worktree.ts
        stage-execute.ts
        stage-verify.ts
        stage-ai-review.ts
      opencode-retry-diag.ts
      …
  domain/
    task.ts
    event.ts
    task/
      model.ts
      transitions.ts
      enqueue.ts
      board.ts
    event/
      model.ts
    ports/
      repositories.ts
  infrastructure/
    clock/
      iso-clock.ts
    project/
      node-project-init-gateway.ts
    persistence/
      jsonl/
        jsonl-utils.ts
        tasks.ts
        events.ts
        quarantine.ts
      sqlite/
        db.ts
        tasks.ts
        events.ts
        quarantine.ts
  bootstrap/
    container.ts
    default-storage-container.ts
```

## 替换存储（最小改动路径）

如果你后续切换到 SQLite/Postgres，不需要改 `queue/worker/insights/doctor` 业务代码，只需：

1. 实现 `src/domain/ports/repositories.ts` 的三个接口：
   - `TaskRepository`
   - `EventRepository`
   - `QuarantineRepository`
2. 在 `src/bootstrap/container.ts` 把 JSONL 适配器替换为你的新适配器（默认 cwd 装配见 **`default-storage-container.ts`**）。
3. CLI 适配层仅调用应用服务/用例，业务调用方式保持稳定。

## 变更日志

详见 [CHANGELOG.md](../../../CHANGELOG.md)。

## License

MIT

→ [用户指南索引](../README.md) · 上一章：[agent-integration.md](./agent-integration.md)
