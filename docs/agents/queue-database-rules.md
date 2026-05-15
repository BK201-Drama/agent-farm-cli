# 禁止直接改队列 DB

- **`.agent-farm/queue/agent_farm.db` 是内部实现细节**，Schema、WAL 模式、`busy_timeout` 由 agent-farm 自行管理。
- **worker / OpenCode 任务不得直接读写该 SQLite 数据库**（包括 `sqlite3` 命令行、SQL 直连等一切方式）。
- **操作队列的唯一入口**：
  - 入队：`agent-farm queue add --task-json` 或 `./scripts/agent-farm-dispatch-batch.sh`
  - 查询：`agent-farm queue list` / `agent-farm doctor` / `agent-farm dashboard`
  - 状态变更：worker 内部通过 `TaskRepository` 领域端口操作，外部用 `agent-farm queue update`
- 违反此规则可能导致 WAL 锁冲突、脏读，或破坏队列一致性。

→ 写 wave 时参见 [wave-authoring.md](./wave-authoring.md)
