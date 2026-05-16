# Wave Prompt Playbook

编写 `.agent-farm/waves/*.json` 时，降低 **空转** 与 **低质量实现** 的要点。

## execute 任务模板

```text
仓库根 <repo>。先 Read：<paths>。若已有实现则只补缺口。
禁止超过 10 分钟无任何 git diff；每步后 git status。

验收：<acceptance_criteria>
```

- 必须非空 `acceptance_criteria`（如 `npm run check && npm test`）
- prompt 指明 `docs/` 或 `src/` 路径
- 大模块拆成 plan → execute，避免并行改同一目录

## plan 任务模板

- prompt 含「验收」或单独写 `acceptance_criteria`
- 产出文件清单，供后续 execute 引用

## 模板文件

复制并替换占位符：

- `examples/waves/templates/plan-prompt.template.md`
- `examples/waves/templates/execute-prompt.template.md`
- 完整两条 wave：`examples/waves/plan-execute-feature.json`

## 校验

```bash
npm run validate:waves                    # examples/waves + .agent-farm/waves
npm run validate:waves:strict             # 全仓库严格
npm run validate:waves:strict:examples    # CI：仅官方 examples
npm run migrate:waves:prompt-hints        # 批量补 Read/git status 约束
```

入队脚本与 `agent-farm queue add --task-json` 使用同一套 `wave-validate` 规则。

## 空转（worker 自动）

| 层级 | 配置 |
|------|------|
| 环境变量 | `AGENT_FARM_EMPTY_RUN=1`，`AGENT_FARM_EMPTY_RUN_GRACE_MINUTES=10` |
| 项目 | `.agent-farm/config.json` → `empty_run`（见 `config.json.example`） |
| 任务 | `empty_run_grace_minutes`、`empty_run_disabled` |

检测到空转 → 中止 OpenCode → **retry 一次**（附加 `[empty-run-fix]`）→ 再失败则 `failed`。

## AI 验收

未开 `--require-ai-review` 时，仅当 worktree diff **≥ 200 行**（`AGENT_FARM_AI_REVIEW_MIN_DIFF_LINES`）才跑全局 ai-review 模板。
