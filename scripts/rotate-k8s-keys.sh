#!/bin/bash

# Configuration
SECRET_NAME="production-db-secrets" # Name of the Kubernetes secret
NAMESPACE="gs-services"             # Kubernetes namespace
MAX_KEYS=5                          # Maximum number of decryption keys to maintain

# Fetch the current Kubernetes secret
SECRET_JSON=$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" -o json)

if [[ -z "$SECRET_JSON" ]]; then
  echo "Error: Failed to fetch the secret $SECRET_NAME in namespace $NAMESPACE."
  exit 1
fi

# Decode the current DB_ENCRYPTION_KEY from the secret
CURRENT_DB_ENCRYPTION_KEY=$(echo "$SECRET_JSON" | jq -r '.data.DB_ENCRYPTION_KEY' | base64 --decode)

if [[ -z "$CURRENT_DB_ENCRYPTION_KEY" ]]; then
  echo "Error: DB_ENCRYPTION_KEY not found in secret $SECRET_NAME."
  exit 1
fi

# Generate a new encryption key using `npx @47ng/cloak generate` and extract only the key value
NEW_DB_ENCRYPTION_KEY=$(npx @47ng/cloak generate | grep "^Key:" | awk '{print $2}')

if [[ -z "$NEW_DB_ENCRYPTION_KEY" ]]; then
  echo "Error: Failed to generate new encryption key with 'npx @47ng/cloak generate'."
  exit 1
fi

# Decode all DB_DECRYPTION_KEY_X entries from the secret
DECRYPTION_KEYS=()
for key in $(echo "$SECRET_JSON" | jq -r '.data | keys[]' | grep '^DB_DECRYPTION_KEY_'); do
  decoded_key=$(echo "$SECRET_JSON" | jq -r ".data[\"$key\"]" | base64 --decode)
  DECRYPTION_KEYS+=("$decoded_key")
done

# Add the current DB_ENCRYPTION_KEY to the decryption keys list
if [[ -n "$CURRENT_DB_ENCRYPTION_KEY" ]]; then
  DECRYPTION_KEYS=("$CURRENT_DB_ENCRYPTION_KEY" "${DECRYPTION_KEYS[@]}")
fi

# Limit the number of decryption keys to MAX_KEYS
if (( ${#DECRYPTION_KEYS[@]} > MAX_KEYS )); then
  DECRYPTION_KEYS=("${DECRYPTION_KEYS[@]:0:$MAX_KEYS}")
fi

# Prepare the JSON patch for the Kubernetes secret
PATCH_DATA='{
  "data": {
    "DB_ENCRYPTION_KEY": "'$(echo -n "$NEW_DB_ENCRYPTION_KEY" | base64 | tr -d '\n')'"'
for ((i=0; i<${#DECRYPTION_KEYS[@]}; i++)); do
  PATCH_DATA+=', "DB_DECRYPTION_KEY_'$((i+1))'": "'$(echo -n "${DECRYPTION_KEYS[i]}" | base64 | tr -d '\n')'"'
done
PATCH_DATA+='
  }
}'

# Update the Kubernetes secret
echo "$PATCH_DATA" | kubectl patch secret "$SECRET_NAME" -n "$NAMESPACE" --patch-file /dev/stdin

if [[ $? -ne 0 ]]; then
  echo "Error: Failed to update the secret $SECRET_NAME."
  exit 1
fi
