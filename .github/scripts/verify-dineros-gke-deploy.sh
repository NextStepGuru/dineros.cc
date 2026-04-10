#!/usr/bin/env bash
# After kubectl apply: wait for both deployments to finish rolling out, then confirm the public site serves /health/ready.
# Requires kubectl credentials (e.g. get-gke-credentials) and profile env (NUXT_PUBLIC_SITE_URL, deployment names).
set -euo pipefail

PROFILE="${1:?usage: verify-dineros-gke-deploy.sh <staging|production>}"

ROOT="${GITHUB_WORKSPACE:-}"
if [[ -z "${ROOT}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# shellcheck source=/dev/null
source "${ROOT}/.deploy/profiles/${PROFILE}.env"

echo "kubectl rollout status: deployment/${MAIN_DEPLOYMENT_NAME} (ns=${K8S_NAMESPACE})"
kubectl rollout status "deployment/${MAIN_DEPLOYMENT_NAME}" -n "${K8S_NAMESPACE}" --timeout=10m

echo "kubectl rollout status: deployment/${MICRO_DEPLOYMENT_NAME} (ns=${K8S_NAMESPACE})"
kubectl rollout status "deployment/${MICRO_DEPLOYMENT_NAME}" -n "${K8S_NAMESPACE}" --timeout=10m

if [[ -z "${NUXT_PUBLIC_SITE_URL:-}" ]]; then
  echo "NUXT_PUBLIC_SITE_URL not set; skipping HTTP check."
  exit 0
fi

url="${NUXT_PUBLIC_SITE_URL}/health/ready"
echo "HTTP check (ready): ${url}"
for i in $(seq 1 48); do
  if curl -fsS --max-time 25 "${url}" >/dev/null; then
    echo "OK: ${url}"
    exit 0
  fi
  echo "Attempt ${i}/48: not ready, sleeping 10s..."
  sleep 10
done

echo "FAILED: ${url} did not return success within ~8m"
exit 1
