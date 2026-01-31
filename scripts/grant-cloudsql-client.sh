#!/usr/bin/env bash
# Grant the dineros GCP service account permission to connect to Cloud SQL via the proxy.
# Proxy needs cloudsql.viewer (get instance metadata) and cloudsql.client (connect).
# Run once: ./scripts/grant-cloudsql-client.sh
set -e
PROJECT="${GCP_PROJECT_ID:-nextstepguru}"
SA="dineros@${PROJECT}.iam.gserviceaccount.com"
for ROLE in roles/cloudsql.viewer roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA}" \
    --role="$ROLE"
done
