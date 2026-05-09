#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

docker run -it \
    --privileged \
    --device /dev/dri:/dev/dri \
    -e DISPLAY \
    -e TERM \
    -e LIBGL_ALWAYS_SOFTWARE=1 \
    -e MESA_GL_VERSION_OVERRIDE=3.3 \
    -e MESA_GLSL_VERSION_OVERRIDE=330 \
    -e OGRE_RTT_MODE=Copy \
    -e QSG_RENDER_LOOP=basic \
    -e QT_X11_NO_MITSHM=1 \
    -e XAUTHORITY \
    -e XDG_RUNTIME_DIR=/tmp/runtime-root \
    -v /tmp/.X11-unix:/tmp/.X11-unix \
    -v $XAUTHORITY:$XAUTHORITY \
    --ipc="host" \
    --name ${DOCKER_CONTAINER_NAME} \
    --volume ${PROJECT_ROOT}/ros2_ws:/home/dockeruser/ros2_ws \
    --network ${DOCKER_NETWORK} \
    --rm \
    ${DOCKER_IMAGE_NAME}

# -e ROS_DOMAIN_ID=0 \