#!/bin/bash
#
export PROJECT_ID="nextstepguru"
export PROJECT_NAME="dineros"
export PROJECT_VERSION="latest"
export DEPLOY_ENV="production"
export NAMESPACE="gs-services"

# Change to project root directory
cd "$(dirname "$0")/.."

docker build -t gcr.io/$PROJECT_ID/$PROJECT_NAME:$PROJECT_VERSION . || exit 1

# docker push gcr.io/$PROJECT_ID/$PROJECT_NAME:$PROJECT_VERSION

# docker run --env-file .env \
#             -p 3050:3050 gcr.io/$PROJECT_ID/$PROJECT_NAME:$PROJECT_VERSION

# kubectl apply -f .deploy/$DEPLOY_ENV/$PROJECT_NAME.yaml

# kubectl rollout restart deployment $PROJECT_NAME-deployment -n $NAMESPACE
