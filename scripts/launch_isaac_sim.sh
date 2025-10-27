#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

echo "Launching Isaac Sim inside the container..."
echo "This will open the Isaac Sim GUI"
echo ""

docker exec -it ${DOCKER_CONTAINER_NAME} /bin/bash -c "/isaac-sim/isaac-sim.sh"

