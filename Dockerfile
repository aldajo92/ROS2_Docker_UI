# humble, jazzy
ARG ROS_DISTRO=humble

FROM osrf/ros:${ROS_DISTRO}-desktop-full
ENV ROS_DISTRO=${ROS_DISTRO}

## Install new gazebo (ionic, harmonic, fortress)
# ENV GAZEBO_VERSION="fortress"
# RUN apt install curl lsb-release gnupg
# RUN curl https://packages.osrfoundation.org/gazebo.gpg --output /usr/share/keyrings/pkgs-osrf-archive-keyring.gpg
# RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/pkgs-osrf-archive-keyring.gpg] http://packages.osrfoundation.org/gazebo/ubuntu-stable $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/gazebo-stable.list > /dev/null
# RUN apt update && apt install -y gz-${GAZEBO_VERSION}
# RUN apt update && apt install -y \
#     ros-${ROS_DISTRO}-ros-gz

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-gazebo-ros-pkgs

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-robot-state-publisher \
    ros-${ROS_DISTRO}-joint-state-publisher

WORKDIR /ros2_ws

# see `cat /ros_entrypoint.sh` for more details
# ENTRYPOINT [ "/ros_entrypoint.sh" ]
