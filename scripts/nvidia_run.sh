#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

# Create persistent directories for Isaac Sim cache and logs
mkdir -p ${PROJECT_ROOT}/isaac_cache
mkdir -p ${PROJECT_ROOT}/isaac_logs
mkdir -p ${PROJECT_ROOT}/isaac_data

docker run -it \
    --privileged \
    --runtime=nvidia \
    --gpus all \
    -e NVIDIA_VISIBLE_DEVICES=all \
    -e NVIDIA_DRIVER_CAPABILITIES=all \
    -e DISPLAY=${DISPLAY} \
    -e TERM \
    -e QT_X11_NO_MITSHM=1 \
    -e XAUTHORITY \
    -e XDG_RUNTIME_DIR=/tmp/runtime-root \
    -e ACCEPT_EULA=Y \
    -v /tmp/.X11-unix:/tmp/.X11-unix:rw \
    -v $XAUTHORITY:$XAUTHORITY \
    -v ${HOME}/.Xauthority:/root/.Xauthority:rw \
    --ipc="host" \
    --name ${DOCKER_CONTAINER_NAME} \
    --volume ${PROJECT_ROOT}/ros2_ws:/workspace/ros2_ws \
    --volume ${PROJECT_ROOT}/isaac_cache:/isaac-sim/kit/cache:rw \
    --volume ${PROJECT_ROOT}/isaac_logs:/isaac-sim/kit/logs:rw \
    --volume ${PROJECT_ROOT}/isaac_data:/isaac-sim/kit/data:rw \
    --network ${DOCKER_NETWORK} \
    -e ROS_DOMAIN_ID=0 \
    --dns=8.8.8.8 \
    --rm \
    ${DOCKER_IMAGE_NAME}
