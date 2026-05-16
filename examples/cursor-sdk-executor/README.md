# Cursor SDK Executor 示例

## 快速 smoke（不入队）

```bash
# 仓库根
export CURSOR_API_KEY=your_key
npm i @cursor/sdk    # 若尚未安装
npm run farm:cursor-sdk:smoke
```

## 经队列跑一条

```bash
export CURSOR_API_KEY=...
export AGENT_FARM_EXECUTOR=cursor-sdk
npm run build

agent-farm queue add --task-json "$(cat examples/cursor-sdk-executor/task.json)"
agent-farm worker --workspace . --workers 1 --drain-idle-loops 1
agent-farm queue show <task_id> --timeline
```

`task.json` 已设 `"executor": "cursor-sdk"`；也可只依赖 `.agent-farm/config.json`。

## 验收

- `runs/<task_id>/execute-1.json` 存在且 `npm run validate:reports` 通过
- 任务进入 `review` 或 `done`（视 verify / review 配置）
