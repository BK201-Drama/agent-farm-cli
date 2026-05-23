# M2 任务拆解

父文档：[roadmap-big-vision-3m.md](./roadmap-big-vision-3m.md)

| ID                     | 交付                                                                                                   | 状态                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| m2-node-report-schema  | `schemas/node-stage-report.schema.json` + `npm run validate:reports`                                   | ✅                                                                                   |
| m2-wave-verify-mode    | wave `mode=verify` 校验 + schema                                                                       | ✅                                                                                   |
| m2-team-playbook       | [playbooks/team-sprint-2w.md](./playbooks/team-sprint-2w.md)                                           | ✅                                                                                   |
| m2-public-api          | `agent-farm-cli/core` exports + [public-api.ts](../src/application/public-api.ts)                      | ✅                                                                                   |
| m2-embed-example       | [examples/embed-minimal](./embed-minimal/)                                                             | ✅                                                                                   |
| m2-executor-port       | [TaskExecutorPort](../src/domain/ports/task-executor.ts) + [ADR-002](./adr/002-cursor-sdk-executor.md) | ✅ 草案                                                                              |
| m2-cursor-sdk-executor | Cursor SDK execute 适配器 + smoke / 文档                                                               | ✅ 代码；手工 e2e 见 [cursor-sdk-executor.md](./integrations/cursor-sdk-executor.md) |
| m2-semver-core         | facade 1.0 候选 + CHANGELOG 迁移                                                                       | ⏳ M3                                                                                |
