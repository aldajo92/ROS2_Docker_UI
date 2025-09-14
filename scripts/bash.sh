#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

# If arguments are provided, execute them as a command
if [ $# -gt 0 ]; then
    docker exec -it ${DOCKER_CONTAINER_NAME} /ros_entrypoint.sh bash -c "$*"
else
    # If no arguments, open interactive bash session
    docker exec -it ${DOCKER_CONTAINER_NAME} /ros_entrypoint.sh /bin/bash
fi
