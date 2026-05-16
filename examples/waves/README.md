# Wave 示例

| 文件 | 用途 |
|------|------|
| [`team-handoff-min.json`](./team-handoff-min.json) | **团队异步交接**最小两条：`plan` + `execute`，`dedupe_key === task_id`，prompt 含验收命令 |

## 使用方式

1. **npm 包**：安装后路径为 `node_modules/agent-farm-cli/examples/waves/team-handoff-min.json`。
2. **`project init`**：默认写入目标项目的 `.agent-farm/waves/team-handoff-min.example.json`（可用 `--skip-example-wave` 关闭）。
3. **入队**：复制到 `.agent-farm/waves/` 并修改 `task_id` 后：

```bash
npm run farm:wave -- .agent-farm/waves/your-wave.json
# 或
node scripts/enqueue-task-wave.mjs .agent-farm/waves/your-wave.json
```

**校验**（改 wave 后）：`npm run validate:waves`（与 CI 一致）。

与 **`test/fixtures/waves/example-wave.json`** 区别：本目录为**产品官方**「个人→团队→CI」样例；fixtures 供单测/历史 wave 回归。

详见 **[协作文档](../../docs/user-guide/zh/collaboration-async-handoff.md)**。
