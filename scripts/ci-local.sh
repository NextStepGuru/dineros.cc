#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
RUN_LINT=true
RUN_TEST=true
RUN_PRECOMMIT=true

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: $0 [--lint-only] [--test-only] [--pre-commit-only]"
  echo ""
  echo "Run CI checks locally using Docker (matching GitHub Actions)"
  echo ""
  echo "Options:"
  echo "  --lint-only       Run only lint checks"
  echo "  --test-only       Run only test checks"
  echo "  --pre-commit-only Run only pre-commit checks"
  echo "  --help, -h        Show this help message"
  exit 0
fi

for arg in "$@"; do
  case $arg in
    --lint-only)
      RUN_LINT=true
      RUN_TEST=false
      RUN_PRECOMMIT=false
      ;;
    --test-only)
      RUN_LINT=false
      RUN_TEST=true
      RUN_PRECOMMIT=false
      ;;
    --pre-commit-only)
      RUN_LINT=false
      RUN_TEST=false
      RUN_PRECOMMIT=true
      ;;
  esac
done

echo -e "${GREEN}🚀 Running CI checks locally with Docker...${NC}"

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Docker image with Node.js 24.14.0 (matching GitHub Actions)
NODE_VERSION="24.14.0"
PNPM_VERSION="9"
IMAGE_NAME="node:${NODE_VERSION}-bullseye"

echo -e "${YELLOW}Using Docker image: ${IMAGE_NAME}${NC}"
echo -e "${YELLOW}Using pnpm version: ${PNPM_VERSION}${NC}"
echo -e "${BLUE}Checks to run:${NC}"
[ "$RUN_LINT" = true ] && echo -e "  ${GREEN}✓${NC} Lint"
[ "$RUN_TEST" = true ] && echo -e "  ${GREEN}✓${NC} Test"
[ "$RUN_PRECOMMIT" = true ] && echo -e "  ${GREEN}✓${NC} Pre-commit"
echo ""

# DATABASE_URL required by Prisma config at generate time (no real DB connection)
export DATABASE_URL="${DATABASE_URL:-mysql://ci:ci@localhost:3306/ci}"

# Isolated container storage (no host node_modules, .nuxt, or pnpm store)
CI_NODE_MODULES_VOLUME="dineros-ci-node_modules"
CI_PNPM_VOLUME="dineros-ci-pnpm_store"
CI_NUXT_VOLUME="dineros-ci-nuxt"

# Build the command to run based on selected checks (DATABASE_URL passed via -e below)
# PNPM_HOME and TMPDIR so pnpm store and temp files stay off read-only /workspace
CMD="set -e
export NODE_ENV=test
export RUN_EDGE_CASE_TESTS=true
export RUN_SLOW_TESTS=true
export CI=true
export PNPM_HOME=/ci-pnpm
export PATH=\"/ci-pnpm:\$PATH\"
export TMPDIR=/tmp

# Enable corepack and setup pnpm
echo '📦 Setting up pnpm...'
corepack enable
corepack prepare pnpm@${PNPM_VERSION} --activate

# Install dependencies (into container's own node_modules volume)
echo '📥 Installing dependencies...'
pnpm install --frozen-lockfile

# Generate Prisma client
echo '🔧 Generating Prisma client...'
npx prisma generate
"

if [ "$RUN_LINT" = true ]; then
  CMD="${CMD}
# Run lint
echo '🔍 Running linter...'
pnpm lint || exit 1
"
fi

if [ "$RUN_TEST" = true ]; then
  CMD="${CMD}
# Run tests
echo '🧪 Running tests...'
pnpm test || exit 1
"
fi

if [ "$RUN_PRECOMMIT" = true ]; then
  CMD="${CMD}
# Setup Python environment for pre-commit
echo '🐍 Setting up pre-commit environment...'
apt-get update -qq > /dev/null 2>&1
apt-get install -y -qq python3 python3-pip curl > /dev/null 2>&1

# Install TruffleHog
echo '🔒 Installing TruffleHog...'
curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin

# Install pre-commit
echo '📋 Installing pre-commit...'
pip3 install --quiet pre-commit

# Run pre-commit hooks
echo '✅ Running pre-commit hooks...'
pre-commit run --all-files --verbose || exit 1
"
fi

CMD="${CMD}
echo '🎉 All CI checks passed!'
"

# Run checks in Docker: mount source read-only; use volumes for install/generate (fully isolated)
# - /workspace = project root (read-only)
# - dineros-ci-node_modules = container's node_modules
# - dineros-ci-nuxt = container's .nuxt (postinstall)
# - dineros-ci-pnpm_store = container's pnpm store
if docker run --rm \
  -v "${PROJECT_ROOT}:/workspace" \
  -v "${CI_NODE_MODULES_VOLUME}:/workspace/node_modules" \
  -v "${CI_NUXT_VOLUME}:/workspace/.nuxt" \
  -v "${CI_PNPM_VOLUME}:/ci-pnpm" \
  -w /workspace \
  -e NODE_ENV=test \
  -e RUN_EDGE_CASE_TESTS=true \
  -e RUN_SLOW_TESTS=true \
  -e CI=true \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e PNPM_HOME=/ci-pnpm \
  -e TMPDIR=/tmp \
  "${IMAGE_NAME}" \
  bash -c "$CMD"; then
  echo -e "\n${GREEN}✅ All CI checks passed!${NC}"
  exit 0
else
  echo -e "\n${RED}❌ CI checks failed!${NC}"
  exit 1
fi
