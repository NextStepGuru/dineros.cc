#!/bin/bash
#
export PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
export REGION="us-central1"
export REPO="${REPO:-your-artifact-registry-repo}"
export PROJECT_NAME="dineros-microservice"
export PROJECT_VERSION="2"
export DEPLOY_ENV="production"
export NAMESPACE="dineros"

# Change to project root directory
cd "$(dirname "$0")/.."

# Source specific environment variables from .env file if it exists
if [ -f ".env" ]; then
  echo "Loading specific environment variables from .env file..."
  export DEPLOY_ENV=$(grep "^DEPLOY_ENV=" .env | cut -d'=' -f2-)
  export NODE_ENV=$(grep "^NODE_ENV=" .env | cut -d'=' -f2-)
else
  echo "Warning: .env file not found. Using default environment variables."
fi

# Build Docker image with environment variables (Artifact Registry)
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$PROJECT_NAME:$PROJECT_VERSION
cd microservice && ./copy-files.sh && cd ..
docker build -t $IMAGE \
    --file microservice/Dockerfile \
    --build-arg DEPLOY_ENV=${DEPLOY_ENV} \
    --build-arg NODE_ENV=${NODE_ENV:-production} \
    --platform linux/amd64 . || exit 1

gcloud auth configure-docker $REGION-docker.pkg.dev --quiet
docker push $IMAGE

docker run --env-file .env \
            -p 3050:3050 $IMAGE

# kubectl apply -f .deploy/$DEPLOY_ENV/microservice.yaml

# kubectl rollout restart deployment $PROJECT_NAME-deployment -n $NAMESPACE
