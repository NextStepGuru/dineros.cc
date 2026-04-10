# AGENTS.md

This file is for AI agent and CI/cloud execution guidance.
If you are contributing code as a person, start with `README.md` and `CONTRIBUTING.md`.

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

- `pnpm dev` — starts Nuxt dev server on port 3000 (requires MySQL + Redis running and `DATABASE_URL` overridden)
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
