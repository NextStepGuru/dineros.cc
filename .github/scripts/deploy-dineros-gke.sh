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

if [[ "${PROFILE}" == "staging" ]]; then
  ROTATION_RENDERED="${TMPDIR:-/tmp}/dineros.key-rotation.${PROFILE}.yaml"
  envsubst < "${ROOT}/.deploy/key-rotation-cronjob.template.yaml" > "${ROTATION_RENDERED}"
  kubectl apply -f "${ROTATION_RENDERED}"

  RBAC_RENDERED="${TMPDIR:-/tmp}/dineros.key-rotation-rbac.${PROFILE}.yaml"
  envsubst < "${ROOT}/.deploy/key-rotation-rbac.template.yaml" > "${RBAC_RENDERED}"
  if ! kubectl apply -f "${RBAC_RENDERED}"; then
    echo "::warning::Key rotation RBAC was not applied (Roles/RoleBindings require container.roles.create and container.roleBindings.create on the deploy identity, e.g. project role roles/container.admin). Apply ${ROOT}/.deploy/key-rotation-rbac.template.yaml once as a cluster admin, or widen IAM and re-run deploy. Rendered file: ${RBAC_RENDERED}"
  fi
fi
