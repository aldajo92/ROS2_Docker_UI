# humble, jazzy
ARG ROS_DISTRO=humble

FROM ros:${ROS_DISTRO}-ros-base
ENV ROS_DISTRO=${ROS_DISTRO}

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-robot-state-publisher \
    ros-${ROS_DISTRO}-joint-state-publisher \
    ros-${ROS_DISTRO}-urdf-tutorial \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-navigation2 \
    ros-${ROS_DISTRO}-nav2-bringup \
    ros-${ROS_DISTRO}-slam-toolbox\
    ros-${ROS_DISTRO}-cv-bridge \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-rqt-reconfigure \
    ros-${ROS_DISTRO}-interactive-markers \
    ros-${ROS_DISTRO}-rosbridge-suite \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt update && apt install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt install -y nodejs \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN npm install -g npm@latest && npm cache clean --force

# RUN apt update && apt install -y \
#     ros-${ROS_DISTRO}-turtlesim

# sudo apt install ros-humble-tf-transformations
RUN apt update && apt install -y \
    ros-${ROS_DISTRO}-tf-transformations

#### USER configuration

ARG HOST_UID
ARG HOST_GID

# Create dockeruser and grant sudo privileges
# RUN groupadd --gid ${HOST_GID} hostgroup \
#     && useradd --uid ${HOST_UID} --gid hostgroup --create-home dockeruser \
#     && apt update && apt install -y sudo \
#     && usermod -aG sudo dockeruser \
#     && echo "dockeruser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN if ! getent group ${HOST_GID} > /dev/null 2>&1; then \
        groupadd --gid ${HOST_GID} hostgroup; \
    fi \
    && useradd --uid ${HOST_UID} --gid ${HOST_GID} --create-home dockeruser

USER dockeruser
ENV HOME=/home/dockeruser

RUN echo "alias bros2='cd ${HOME}/ros2_ws && source /opt/ros/${ROS_DISTRO}/setup.bash && colcon build --symlink-install && source ${HOME}/ros2_ws/install/setup.bash'" >> ~/.bashrc
RUN echo "alias sros2='source /opt/ros/${ROS_DISTRO}/setup.bash && source ${HOME}/ros2_ws/install/setup.bash'" >> ~/.bashrc
RUN echo "echo 'Welcome to ROS2 docker container'" >> ~/.bashrc
RUN echo "echo 'Leaving the ROS2 Docker container. Goodbye!'" >> ~/.bash_logout

SHELL ["/bin/bash", "-l", "-c"]
CMD ["/bin/bash", "--login"]

#### end USER configuration

WORKDIR ${HOME}/ros2_ws
