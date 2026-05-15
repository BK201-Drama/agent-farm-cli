# `doctor` / `insights` 的 `--brief` 约定

`agent-farm doctor` 与 `agent-farm insights` 支持 `--brief` 选项：

- **默认**：输出完整 JSON 到 stdout（向后兼容）
- **`--brief`**：向 stderr 输出多行人类可读摘要（任务总数、状态计数、top 失败原因截断、doctor 的 sqlite 探针结论），不输出 JSON
- 不影响 `--output-file` 选项的行为

→ 索引：[README.md](./README.md)
