#!/bin/bash
#
export PROJECT_ID="nextstepguru"
export PROJECT_NAME="dineros-microservice"
export PROJECT_VERSION="2"
export DEPLOY_ENV="production"
export NAMESPACE="gs-services"

# Change to project root directory
cd "$(dirname "$0")/.."

# Source specific environment variables from .env file if it exists
if [ -f ".env" ]; then
  echo "Loading specific environment variables from .env file..."
  # Load only the three required variables
  export NUXT_UI_PRO_LICENSE=$(grep "^NUXT_UI_PRO_LICENSE=" .env | cut -d'=' -f2-)
  export DEPLOY_ENV=$(grep "^DEPLOY_ENV=" .env | cut -d'=' -f2-)
  export NODE_ENV=$(grep "^NODE_ENV=" .env | cut -d'=' -f2-)
else
  echo "Warning: .env file not found. Using default environment variables."
fi

# Build Docker image with environment variables
docker build -t gcr.io/$PROJECT_ID/$PROJECT_NAME:$PROJECT_VERSION \
    --build-arg NUXT_UI_PRO_LICENSE=${NUXT_UI_PRO_LICENSE} \
    --build-arg DEPLOY_ENV=${DEPLOY_ENV} \
    --build-arg NODE_ENV=${NODE_ENV:-production} \
    --platform linux/amd64 . || exit 1

docker push gcr.io/$PROJECT_ID/$PROJECT_NAME:$PROJECT_VERSION

docker run --env-file .env \
            -p 3050:3050 gcr.io/$PROJECT_ID/$PROJECT_NAME:$PROJECT_VERSION

# kubectl apply -f .deploy/$DEPLOY_ENV/microservice.yaml

# kubectl rollout restart deployment $PROJECT_NAME-deployment -n $NAMESPACE
