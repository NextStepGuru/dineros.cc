# Contributing to Dineros

Thanks for your interest in improving Dineros.

## Before you start

- Read the `README.md` for setup and local development.
- Search existing issues and pull requests before opening a new one.
- Keep pull requests focused to one topic.

## Development setup

1. Fork the repository.
2. Clone your fork.
3. Install dependencies:
   - `pnpm install`
4. Copy environment variables:
   - `cp .env.example .env`
5. Start dependencies and app:
   - `docker compose up -d`
   - `pnpm dev`

## Branch naming

Use short, descriptive names:

- `feat/add-reconciliation-shortcuts`
- `fix/forecast-date-boundary`
- `docs/update-contributing-guide`

## Pull request process

1. Create a branch from `main`.
2. Make your changes.
3. Run local checks:
   - `pnpm lint`
   - `pnpm test`
4. Push and open a pull request.
5. Complete the PR template checklist.

## CI behavior for forks

- PRs from forks run contributor-safe checks (lint/test/security checks).
- Deploy and staging E2E jobs require maintainer cloud credentials and are skipped for fork PRs.
- Do not treat skipped deploy jobs on fork PRs as failures.

## Commit sign-off (required)

This project requires Developer Certificate of Origin (DCO) sign-off on commits.

Use one of these options:

- `git commit -s -m "feat: your message"`
- Or add this trailer manually:
  - `Signed-off-by: Your Name <you@example.com>`

## Coding standards

- Follow existing patterns in the file you are editing.
- Keep changes minimal and scoped.
- Update docs when behavior changes (see below).
- Do not include secrets, keys, or credentials in code, tests, logs, or screenshots.
- Never commit `.env` files anywhere in this repository tree.
- Commit only template files such as `.env.example` with placeholder values.

## Docs when behavior changes

If you change how a subsystem works (Plaid, encryption queries, forecast balances, queues, API surface, etc.):

1. Update the matching file under `.agent/logic/` (how it works).
2. Update any matching globbed rule under `.cursor/rules/` (agent do/don’t for that area).
3. Keep human docs (`README.md`, `docs/`) in sync only when setup or contributor-facing behavior changed.

See `docs/README.md` for an index and `AGENTS.md` for the agent domain-doc map.

## Cursor-specific files

The `.cursor/` directory, `.agent/logic/`, and `AGENTS.md` are tooling guidance for AI-assisted workflows.
Contributors do not need Cursor to contribute.

## Reporting security issues

Do not open public issues for vulnerabilities. Follow `SECURITY.md`.
