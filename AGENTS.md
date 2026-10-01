# AGENTS.md

This file is for AI agent and CI/cloud execution guidance.
If you are contributing code as a person, start with `README.md` and `CONTRIBUTING.md`.

## Domain docs (read when relevant)

Policy and do/don’t live in `.cursor/rules/`. How the system works lives in the generated `knowledge/` OKF bundle (see the managed section at the bottom of this file and `.cursor/rules/okf-memory.mdc`): search it with `okf search "<query>" knowledge --limit 3 --json` or start from `knowledge/index.md` — do not blanket-scan or grep it. Hand edits inside `knowledge/` may be overwritten by the NextStepGuru regeneration; put corrections in a PR comment or in the source the concept describes.

Areas the bundle does not cover yet — read the source instead:

| Topic | Source |
| --- | --- |
| BullMQ queues + nuxt-cron | `app/server/queues/`, `app/server/cron/` |
| Plaid link / sync / balances | `app/server/services/PlaidSyncService.ts`, `app/server/cron/plaid*.ts` |
| Field encryption / queries | `app/lib/normalizePrismaDmmf.ts`, `app/server/clients/prismaClient.ts`, `@encrypted` in `app/prisma/schema.prisma` |
| Forecast engine | `app/server/services/forecast/` |
| Statement reconciliation | `app/server/services/reconciliationService.ts`, `app/server/api/reconciliation/` |
| Microservice | `microservice/` |
| Mobile app (Expo) | `mobile/` |
| Deploy / CI | `.github/workflows/`, `.deploy/` |

When behavior changes, update the matching globbed rule under `.cursor/rules/` (see `00-global-safety.mdc` → Rule Updates) and, where a `knowledge/` concept covers the area, follow `okf-memory.mdc` for corrections.

## Cursor Cloud specific instructions

### Infrastructure

MySQL 8.0 and Redis are installed natively (not via Docker — `docker compose up` fails in nested-container Cloud Agent VMs due to cgroup issues). They must be started manually each session:

```bash
# Start MySQL
sudo mkdir -p /var/run/mysqld && sudo chown mysql:mysql /var/run/mysqld
sudo mysqld --user=mysql --datadir=/var/lib/mysql &>/tmp/mysqld.log &
sleep 3
sudo chmod 755 /var/run/mysqld

# Start Redis
sudo redis-server --daemonize yes --appendonly yes
```

The `dineros` MySQL user (password: `dineros`) and `dineros` database are already created.

### DATABASE_URL override

A `DATABASE_URL` secret is injected into the environment that points at a remote/production database. **You must override it** for local development:

```bash
export DATABASE_URL="<value from .env file>"
```

Copy the `DATABASE_URL` value from `.env` (or `.env.example`) and export it before running `pnpm dev`, `prisma migrate deploy`, or any command that touches the database. The `.env` file has the correct local value, but the injected environment variable takes precedence.

### Running the app

See `README.md` for standard commands. Key notes:

- `pnpm dev` — starts Nuxt dev server on port 3102 (requires MySQL + Redis running and `DATABASE_URL` overridden)
- `pnpm lint` — ESLint (exits 0 with only minor warnings)
- `pnpm test` — Vitest unit/integration tests (no DB needed; mocks in place). Run with `TZ=UTC`.
- `npx prisma generate` — regenerate Prisma client after schema changes
- `npx prisma migrate deploy` — apply pending migrations (requires `DATABASE_URL` override)

### GKE deploy and staging key-rotation RBAC

The GitHub Actions service account that runs `kubectl apply` for staging must be able to create **Roles** and **RoleBindings** in `dineros-staging`, or those resources will fail with `Forbidden` while Deployments/CronJob apply. Grant one of:

- Project role **`roles/container.admin`** (broad), or
- A custom role including **`container.roles.create`** and **`container.roleBindings.create`** on the GKE cluster.

Alternatively apply [`.deploy/key-rotation-rbac.template.yaml`](.deploy/key-rotation-rbac.template.yaml) once (rendered with the same `envsubst` as deploy) using an account with cluster admin. The deploy script applies it best-effort and emits a GitHub Actions warning if RBAC apply fails.

### Test notes

- Tests (`pnpm test`) run purely in Node with mocks — no MySQL/Redis needed.
- For crypto/bcrypt tests: `pnpm test:crypto` (slow, not part of default suite).
- The signup form auto-fills random test data when `DEPLOY_ENV=local`.

<!-- BEGIN nextstepguru-knowledge (managed, do not edit) -->
Persistent project knowledge lives in `knowledge/`, an OKF v0.2 bundle.

Top-level areas:
- `app/` (79 concepts)
- `project/` (1 concept)

If `okf_*` MCP tools or an `okf` binary are available: `okf search "<query>" knowledge --limit 3 --json`, then `okf show <id>` only for hits worth reading. Prefer MCP tools when both exist.

Otherwise read `knowledge/index.md` first, use the one-sentence descriptions to pick concepts, and follow relative links. Do not blanket-scan or grep the directory.

`generated:` is model-authored and may be wrong; never promote it to `verified:`. Treat `status: deprecated` (superseded) as history.

NextStepGuru regenerates this bundle. Hand edits inside `knowledge/` may be overwritten — put corrections in a PR comment or in the source the concept describes.
<!-- END nextstepguru-knowledge -->
