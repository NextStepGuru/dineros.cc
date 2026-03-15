#!/usr/bin/env bash
# Run the dineros:local image with MySQL and Redis from docker-compose (same network).
# Start Compose first: docker compose up -d
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Find the compose app-network (e.g. dineroscc_app-network or dineros-cc_app-network)
NETWORK="$(docker network ls --format '{{.Name}}' | grep -E '_app-network$' | head -1)"
if [[ -z "$NETWORK" ]]; then
  echo "No app-network found. Start Compose first: docker compose up -d" >&2
  exit 1
fi

# Use Compose service names for DB and Redis (container must be on same network)
export REDIS_HOST="${REDIS_HOST:-redis}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export DATABASE_URL="${DATABASE_URL:-mysql://dineros:dineros@mysql:3306/dineros}"

# Optional: LOGIN_DEBUG=1 logs hash shape in HashService.verify (for debugging password verify failures)
RUN_ARGS=(
  -e DATABASE_URL="$DATABASE_URL"
  -e REDIS_HOST="$REDIS_HOST"
  -e REDIS_PORT="$REDIS_PORT"
)
[[ -n "${LOGIN_DEBUG:-}" ]] && RUN_ARGS+=( -e "LOGIN_DEBUG=$LOGIN_DEBUG" )

exec docker run --rm \
  --network "$NETWORK" \
  --env-file .env \
  -p 3000:3000 \
  "${RUN_ARGS[@]}" \
  "$@" \
  dineros:local
