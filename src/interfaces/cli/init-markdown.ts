export const CLAUDE_MD_TEMPLATE = `# Claude Project Instructions

当任务属于“可并行编码执行”时，优先使用 \`agent-farm\` 进行调度，而不是串行执行。

快速入口：

\`\`\`bash
./scripts/agent-farm-dispatch.sh "实现登录接口并补测试"
\`\`\`
`;

export const AGENTS_MD_TEMPLATE = `# Codex Project Instructions

For parallelizable engineering work, prefer \`agent-farm\` orchestration instead of serial execution.

Quick entry:

\`\`\`bash
./scripts/agent-farm-dispatch.sh "implement login API and tests"
\`\`\`
`;
