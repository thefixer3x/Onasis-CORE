#!/usr/bin/env bash
set -euo pipefail

# Build Docker image and tag for staging
IMAGE_NAME="${DOCKER_REGISTRY:-local}/onasis-unified-router:staging"
echo "Building image ${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" .

# Push if registry provided
if [ -n "${DOCKER_REGISTRY:-}" ]; then
  echo "Pushing to registry ${DOCKER_REGISTRY}"
  docker push "${IMAGE_NAME}"
fi

echo "Deploy to your staging infra (K8s, Docker Compose, or PM2)."
echo "Example (PM2): pm2 start ecosystem.config.cjs --env staging"

