#!/usr/bin/env bash
# Render .deploy/dineros.template.yaml with a profile + envsubst, then kubectl apply.
# Env: IMAGE_TAG, GCP_PROJECT_ID (set by CI).
set -euo pipefail

PROFILE="${1:?usage: deploy-dineros-gke.sh <staging|production> <image-tag>}"
IMAGE_TAG="${2:?image tag required}"

ROOT="${GITHUB_WORKSPACE:-}"
if [[ -z "${ROOT}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

export IMAGE_TAG

# shellcheck source=/dev/null
source "${ROOT}/.deploy/profiles/${PROFILE}.env"

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"

RENDERED="${TMPDIR:-/tmp}/dineros.rendered.${PROFILE}.yaml"
envsubst < "${ROOT}/.deploy/dineros.template.yaml" > "${RENDERED}"
kubectl apply -f "${RENDERED}"
