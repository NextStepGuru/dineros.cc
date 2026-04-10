#!/usr/bin/env sh
# In-cluster DB field-encryption key rotation (append-only decryption slots).
# Required env: K8S_NAMESPACE, SECRET_DB, MAIN_DEPLOYMENT_NAME, MICRO_DEPLOYMENT_NAME,
# MICRO_SERVICE_NAME, INTERNAL_API_TOKEN (from SECRET_APP).
set -eu

cd /repo/microservice

current_b64="$(kubectl get secret "${SECRET_DB}" -n "${K8S_NAMESPACE}" -o jsonpath='{.data.DB_ENCRYPTION_KEY}')"
if [ -z "${current_b64}" ]; then
  echo "error: DB_ENCRYPTION_KEY missing in secret ${SECRET_DB}" >&2
  exit 1
fi

max_idx="$(kubectl get secret "${SECRET_DB}" -n "${K8S_NAMESPACE}" -o json | jq -r '
  [.data // {} | keys[] | select(test("^DB_DECRYPTION_KEY_[0-9]+$"))
    | sub("^DB_DECRYPTION_KEY_"; "") | tonumber]
  | if length > 0 then max else 0 end')"
next_idx=$((max_idx + 1))
dec_key_name="DB_DECRYPTION_KEY_${next_idx}"

current_enc="$(printf '%s' "${current_b64}" | base64 -d)"

new_enc="$(pnpm exec cloak generate | grep '^Key:' | awk '{print $2}')"
if [ -z "${new_enc}" ]; then
  echo "error: failed to generate key with cloak" >&2
  exit 1
fi

old_enc_b64="$(printf '%s' "${current_enc}" | base64 | tr -d '\n')"
new_enc_b64="$(printf '%s' "${new_enc}" | base64 | tr -d '\n')"

patch_json="$(jq -n \
  --arg enc "${new_enc_b64}" \
  --arg k "${dec_key_name}" \
  --arg v "${old_enc_b64}" \
  '{ data: ({ DB_ENCRYPTION_KEY: $enc } + { ($k): $v }) }')"

kubectl patch secret "${SECRET_DB}" -n "${K8S_NAMESPACE}" --type merge -p "${patch_json}"

kubectl rollout restart "deployment/${MAIN_DEPLOYMENT_NAME}" -n "${K8S_NAMESPACE}"
kubectl rollout restart "deployment/${MICRO_DEPLOYMENT_NAME}" -n "${K8S_NAMESPACE}"

kubectl rollout status "deployment/${MAIN_DEPLOYMENT_NAME}" -n "${K8S_NAMESPACE}" --timeout=15m
kubectl rollout status "deployment/${MICRO_DEPLOYMENT_NAME}" -n "${K8S_NAMESPACE}" --timeout=15m

curl -fsS \
  -H "x-internal-token: ${INTERNAL_API_TOKEN}" \
  "http://${MICRO_SERVICE_NAME}.${K8S_NAMESPACE}.svc.cluster.local:3050/migrate"

echo ""
echo "ok: key rotation and reencrypt migrate finished"
