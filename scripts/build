#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

docker build --network=host -t ${DOCKER_IMAGE_NAME} ${PROJECT_ROOT}
