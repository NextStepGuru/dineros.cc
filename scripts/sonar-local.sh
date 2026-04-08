#!/usr/bin/env bash
# Local SonarCloud analysis: coverage (optional) + sonar-scanner.
# Requires: sonar-scanner on PATH, SONAR_TOKEN (SonarCloud → Account → Security).
# Usage:
#   pnpm sonar
#   pnpm sonar:quick          # reuse existing app/coverage/lcov.info
#   SONAR_TOKEN=xxx pnpm sonar
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if ! command -v sonar-scanner >/dev/null 2>&1; then
  echo "sonar-scanner not found in PATH." >&2
  exit 1
fi

load_token_from_env_file() {
  local f="$1"
  [ -f "$f" ] || return 1
  grep -q '^SONAR_TOKEN=' "$f" || return 1
  local line
  line="$(grep '^SONAR_TOKEN=' "$f" | head -1)"
  local val="${line#SONAR_TOKEN=}"
  val="${val%$'\r'}"
  if [[ "$val" == \"*\" ]]; then
    val="${val#\"}"
    val="${val%\"}"
  elif [[ "$val" == \'*\' ]]; then
    val="${val#\'}"
    val="${val%\'}"
  fi
  export SONAR_TOKEN="$val"
}

if [ -z "${SONAR_TOKEN:-}" ]; then
  load_token_from_env_file "$ROOT/.env" || true
fi
if [ -z "${SONAR_TOKEN:-}" ]; then
  load_token_from_env_file "$ROOT/.env.local" || true
fi

if [ -z "${SONAR_TOKEN:-}" ]; then
  echo "SONAR_TOKEN is not set. Export it or add SONAR_TOKEN=... to .env (see .env.example)." >&2
  echo "Token: https://sonarcloud.io/account/security/" >&2
  exit 1
fi

NO_COV=0
if [ "${1:-}" = "--no-coverage" ] || [ "${SKIP_COVERAGE:-0}" = "1" ]; then
  NO_COV=1
fi

if [ "$NO_COV" = "1" ]; then
  if [ ! -f "$ROOT/app/coverage/lcov.info" ]; then
    echo "No app/coverage/lcov.info. Run pnpm sonar (full) once to generate coverage." >&2
    exit 1
  fi
  echo "Skipping tests; using existing app/coverage/lcov.info"
else
  echo "Prisma generate + test coverage (this can take several minutes)..."
  pnpm --filter dineros-app exec prisma generate
  pnpm test:coverage
fi

echo "Running sonar-scanner (SonarCloud)..."
exec sonar-scanner -Dsonar.host.url=https://sonarcloud.io
