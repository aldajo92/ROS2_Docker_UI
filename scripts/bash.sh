#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

docker exec -it ${DOCKER_CONTAINER_NAME} /ros_entrypoint.sh /bin/bash
