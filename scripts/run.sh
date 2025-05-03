#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

docker run -it \
    --privileged \
    --device /dev/dri:/dev/dri \
    -e DISPLAY \
    -e TERM \
    -e QT_X11_NO_MITSHM=1 \
    -e XAUTHORITY \
    -e XDG_RUNTIME_DIR=/tmp/runtime-root \
    -v /tmp/.X11-unix:/tmp/.X11-unix \
    -v $XAUTHORITY:$XAUTHORITY \
    --ipc="host" \
    --name ${DOCKER_CONTAINER_NAME} \
    --volume ${PROJECT_ROOT}/ros2_ws:/home/dockeruser/ros2_ws \
    --network ${DOCKER_NETWORK} \
    --dns=8.8.8.8 \
    --rm \
    ${DOCKER_IMAGE_NAME}

# -e ROS_DOMAIN_ID=0 \