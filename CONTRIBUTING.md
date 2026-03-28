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
- Update docs when behavior changes.
- Do not include secrets, keys, or credentials in code, tests, logs, or screenshots.
- Never commit `.env` files anywhere in this repository tree.
- Commit only template files such as `.env.example` with placeholder values.

## Cursor-specific files

The `.cursor/` directory and `AGENTS.md` are tooling guidance for AI-assisted workflows.
Contributors do not need Cursor to contribute.

## Reporting security issues

Do not open public issues for vulnerabilities. Follow `SECURITY.md`.
