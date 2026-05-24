export const CLAUDE_MD_TEMPLATE = `# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Agent Farm 调度

当任务属于”可并行编码执行”时，优先用 \`agent-farm\` 调度，而不是串行执行。

### 快速入口

\`\`\`bash
# 单条任务
./scripts/agent-farm-dispatch.sh “实现登录接口并补测试”

# Windows（无 Bash 时）
npm run farm:dispatch:node -- “实现登录接口并补测试”
\`\`\`

### Wave 批量任务

1. 在 \`.agent-farm/waves/\` 写 JSON 数组，每条至少含 \`task_id\`、\`dedupe_key\`、\`prompt\`
2. 启动：\`npm run farm:wave -- .agent-farm/waves/你的文件.json\`

### 健康检查

\`\`\`bash
agent-farm doctor --ci-exit
agent-farm insights
\`\`\`

### 队列管理

\`\`\`bash
agent-farm queue list          # 查看队列
agent-farm stuck list --brief  # 卡住的任务
agent-farm dashboard           # TUI 看板
\`\`\`

**注意**：不要用 sqlite3 等工具直连 \`.agent-farm/queue/agent_farm.db\`——始终通过 \`agent-farm queue ...\` 操作。
`;

export const AGENTS_MD_TEMPLATE = `# Codex Project Instructions

For parallelizable engineering work, prefer \`agent-farm\` orchestration instead of serial execution.

Quick entry:

\`\`\`bash
./scripts/agent-farm-dispatch.sh "implement login API and tests"
\`\`\`
`;
