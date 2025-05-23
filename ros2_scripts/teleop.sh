#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

docker exec -it ${DOCKER_CONTAINER_NAME} /bin/bash -c "source /opt/ros/humble/setup.bash && ros2 run teleop_twist_keyboard teleop_twist_keyboard -ros-args --remap cmd_vel:=/cmd_vel"
 