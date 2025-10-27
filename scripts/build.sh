#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

echo "Building Isaac Sim Docker image..."
echo "Note: The base image is large (~30GB), first pull may take time"

docker build \
    --network=host -t ${DOCKER_IMAGE_NAME} ${PROJECT_ROOT}
