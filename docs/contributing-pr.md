# 合并 PR 与发布清单

## 合并前（贡献者）

- [ ] `npm run check && npm test && npm run test:bdd`
- [ ] `npm run ci:health:local`（需先 `npm run build`）
- [ ] 若改 `project init` / 示例 wave：跑 `test/project/init-project.test.ts`
- [ ] CHANGELOG `[Unreleased]` 或版本节已更新

## 合并后（维护者）

- [ ] GitHub **Actions → Agent farm health (cron) → Run workflow** 绿跑
- [ ] 主 CI（`ci.yml`）在 `main` 上绿跑
- [ ] `npm publish`（`npm run release` 或按 **[faq-publish](user-guide/zh/faq-publish-architecture.md)**）
- [ ] 更新 `docs/roadmap-one-week-personal-team-ci.md` 验收表日期（若里程碑相关）

## PR 描述模板

```markdown
## Summary
- …

## Test plan
- [ ] npm run check && npm test && npm run test:bdd
- [ ] npm run ci:health:local
- [ ] …
```
