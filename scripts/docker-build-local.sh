#!/usr/bin/env bash
# Build the main-site image the same way GitHub Actions does (same Dockerfile, args, platform).
# No push; image is loaded into local Docker. Uses a local cache dir instead of GHA cache.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Same as GHA: linux/amd64
PLATFORM="linux/amd64"
# Local cache dir (GHA uses type=gha; we use type=local so build behavior is similar)
CACHE_DIR="${DOCKER_BUILD_CACHE_DIR:-.docker-build-cache}"
mkdir -p "$CACHE_DIR"

# Builder name; create buildx builder similar to GHA (docker-container driver)
BUILDER_NAME="dineros-local-builder"
if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
  echo "Creating buildx builder $BUILDER_NAME (docker-container, same as GHA)..."
  docker buildx create \
    --name "$BUILDER_NAME" \
    --driver docker-container \
    --buildkitd-flags '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host' \
    --use
fi
docker buildx use "$BUILDER_NAME"

# Same env as GHA
export CI=true

# Docker applies .dockerignore from the build context (.) automatically; require it so context is correct
if [[ ! -f .dockerignore ]]; then
  echo "Error: .dockerignore not found in repo root. Build context would not be filtered." >&2
  exit 1
fi

echo "Building (context: ., file: ./Dockerfile, .dockerignore applied, platform: $PLATFORM)..."
if [[ -n "${NUXT_UI_PRO_LICENSE:-}" ]]; then
  docker buildx build \
    --file ./Dockerfile \
    --platform "$PLATFORM" \
    --cache-from "type=local,src=$CACHE_DIR" \
    --cache-to "type=local,dest=$CACHE_DIR,mode=max" \
    --provenance=false \
    --sbom=false \
    --load \
    --tag "dineros:local" \
    --build-arg "NUXT_UI_PRO_LICENSE=$NUXT_UI_PRO_LICENSE" \
    .
else
  docker buildx build \
    --file ./Dockerfile \
    --platform "$PLATFORM" \
    --cache-from "type=local,src=$CACHE_DIR" \
    --cache-to "type=local,dest=$CACHE_DIR,mode=max" \
    --provenance=false \
    --sbom=false \
    --load \
    --tag "dineros:local" \
    .
fi

echo "Done. Image: dineros:local"
