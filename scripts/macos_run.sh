#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

docker run -it \
    --privileged \
    -e TERM \
    -e QT_X11_NO_MITSHM=1 \
    -e XDG_RUNTIME_DIR=/tmp/runtime-root \
    -p 5173:5173 \
    -p 9090:9090 \
    --ipc="host" \
    --name ${DOCKER_CONTAINER_NAME} \
    --volume ${PROJECT_ROOT}/ros2_ws:/home/dockeruser/ros2_ws \
    --dns=8.8.8.8 \
    --rm \
    ${DOCKER_IMAGE_NAME}
