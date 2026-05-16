# FAQ, publishing & source layout

> Migrated from the root README; Chinese version: [../zh/faq-publish-architecture.md](../zh/faq-publish-architecture.md).

## FAQ

- **Tasks not moving?** Run `agent-farm doctor` — often stuck in `review` or quarantined.
- **Cannot enqueue “same” task?** Active `dedupe_key` collision; change key or finish/cancel the old task.
- **Reinstall skill/scripts?** `agent-farm project init --target-dir . --force`
- **Bootstrap OK?** Check `.agent-farm/queue/`, `.cursor/skills/agent-farm-dispatch/SKILL.md`, `scripts/agent-farm-dispatch.sh`

## Publish to npm

From **0.1.42**, the published package includes **`examples/`** (e.g. `examples/waves/team-handoff-min.json`). `ci:health:local` is a **dev script in this repo**; consumer repos should use `agent-farm doctor --ci-exit` or the workflow written by `project init` (`.github/workflows/agent-farm-health.yml`).

```bash
npm adduser
npm run build
npm publish --access public
```

This repo also documents `npm run release` (`scripts/release.mjs`) for maintainers.

## Source layout (ports & adapters)

- `src/domain/ports/` — repository & clock interfaces
- `src/domain/task/`, `src/domain/event/` — bounded contexts
- `src/application/use-cases/` — application services
- `src/application/facades/` — queue/worker/insights/doctor facades
- `src/application/contracts/` — app-level ports (not domain ports)
- `src/interfaces/cli/` — Commander adapters + `tui/task-dashboard/`
- `src/infrastructure/persistence/{jsonl,sqlite}/` — storage adapters
- `src/bootstrap/container.ts` — wiring; `default-storage-container.ts` — cwd-based `createDefaultStorageContainer` for CLI

See the **directory tree** in the Chinese mirror for the full ASCII outline.

## Swapping storage

Implement `TaskRepository`, `EventRepository`, `QuarantineRepository` from `src/domain/ports/repositories.ts`, swap bindings in `src/bootstrap/container.ts` (cwd defaults live in `default-storage-container.ts`); CLI stays thin.

## Changelog

[CHANGELOG.md](../../../CHANGELOG.md)

## License

MIT

→ [User guide index](../README.md) · Previous: [Agent integration](./agent-integration.md)
