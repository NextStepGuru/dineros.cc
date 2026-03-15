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

# Build the command to run based on selected checks
CMD="set -e
export NODE_ENV=test
export RUN_EDGE_CASE_TESTS=true
export RUN_SLOW_TESTS=true
export CI=true

# Enable corepack and setup pnpm
echo '📦 Setting up pnpm...'
corepack enable
corepack prepare pnpm@${PNPM_VERSION} --activate

# Install dependencies
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

# Run checks in Docker container
if docker run --rm \
  -v "${PROJECT_ROOT}:/workspace" \
  -w /workspace \
  -e NODE_ENV=test \
  -e RUN_EDGE_CASE_TESTS=true \
  -e RUN_SLOW_TESTS=true \
  -e CI=true \
  "${IMAGE_NAME}" \
  bash -c "$CMD"; then
  echo -e "\n${GREEN}✅ All CI checks passed!${NC}"
  exit 0
else
  echo -e "\n${RED}❌ CI checks failed!${NC}"
  exit 1
fi
