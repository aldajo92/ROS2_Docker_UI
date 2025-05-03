# humble, jazzy
ARG ROS_DISTRO=humble

FROM osrf/ros:${ROS_DISTRO}-desktop
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
    ros-${ROS_DISTRO}-gazebo-ros-pkgs \
    ros-${ROS_DISTRO}-gazebo-ros2-control \
    ros-${ROS_DISTRO}-ros-gz \
    ros-${ROS_DISTRO}-ros-ign-bridge

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-robot-state-publisher \
    ros-${ROS_DISTRO}-joint-state-publisher \
    ros-${ROS_DISTRO}-urdf-tutorial

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-navigation2 \
    ros-${ROS_DISTRO}-nav2-bringup \
    ros-${ROS_DISTRO}-slam-toolbox\
    ros-${ROS_DISTRO}-cv-bridge

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-rqt-reconfigure

# RUN apt update && apt install -y \
#     ros-${ROS_DISTRO}-turtlesim

#### USER configuration

ARG HOST_UID
ARG HOST_GID

# Create dockeruser and grant sudo privileges
RUN groupadd --gid ${HOST_GID} hostgroup \
    && useradd --uid ${HOST_UID} --gid hostgroup --create-home dockeruser \
    && apt update && apt install -y sudo \
    && usermod -aG sudo dockeruser \
    && echo "dockeruser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER dockeruser
ENV HOME=/home/dockeruser

RUN echo "alias bros2='cd ${HOME}/ros2_ws && source /opt/ros/${ROS_DISTRO}/setup.bash && colcon build && source ${HOME}/ros2_ws/install/setup.bash'" >> ~/.bashrc
RUN echo "alias sros2='source /opt/ros/${ROS_DISTRO}/setup.bash && source ${HOME}/ros2_ws/install/setup.bash'" >> ~/.bashrc
RUN echo "echo 'Welcome to ROS2 docker container'" >> ~/.bashrc
RUN echo "echo 'Leaving the ROS2 Docker container. Goodbye!'" >> ~/.bash_logout

SHELL ["/bin/bash", "-l", "-c"]
CMD ["/bin/bash", "--login"]

#### end USER configuration

WORKDIR ${HOME}/ros2_ws
