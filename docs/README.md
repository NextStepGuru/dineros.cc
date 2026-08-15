# Documentation Index

## Human docs

- `post-restore-encryption-plan.md`: restore-time encrypted data handling and placeholder strategy.
- Root `README.md`: local setup and commands.
- Root `CONTRIBUTING.md`: PR process and when to update docs.

## Agent / tooling docs

- `AGENTS.md` (repo root): Cursor Cloud ops + domain-doc map.
- `.cursor/rules/`: policy and globbed do/don’t (safety, tests, Plaid, encryption queries, balances).
- `.agent/logic/`: how the system works (read when working in that area):

| File | Topic |
| --- | --- |
| `overview.mdc` | Purpose / stack |
| `architecture.mdc` | Directory map |
| `data-model.mdc` | Prisma entities / balances |
| `api-surface.mdc` | API routes |
| `queues-and-cron.mdc` | BullMQ + cron |
| `encryption-and-keys.mdc` | Field encryption |
| `plaid.mdc` | Plaid link / sync / balances |
| `forecast-engine.mdc` | Forecast modules |
| `microservice.mdc` | Companion service |
| `deployment.mdc` | CI / GKE |
| `patterns.mdc` | Conventions |
| `testing.mdc` | Test layout |
