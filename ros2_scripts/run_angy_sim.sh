#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"
source ${PROJECT_ROOT}/config_docker.sh

$PROJECT_ROOT/scripts/bash.sh "cd ~/ros2_ws/angy_sim_ros2 && npm install && npm run dev"