# NVIDIA Isaac Sim 5.1.0 with ROS2
FROM nvcr.io/nvidia/isaac-sim:5.1.0

# Isaac Sim includes ROS2 Humble, but since base is Ubuntu 24.04 (Noble),
# we'll use ROS2 Jazzy for additional packages (Jazzy is for Ubuntu 24.04)
ENV ROS_DISTRO=jazzy

# Switch to root for package installation
USER root

# Install additional utilities
RUN apt-get update && apt-get install -y \
    vim \
    git \
    curl \
    wget \
    software-properties-common \
    lsb-release \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Add ROS2 Jazzy repository (matches Ubuntu 24.04 Noble)
RUN curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/ros2.list > /dev/null

# Install additional ROS2 Jazzy packages
RUN apt-get update && apt-get install -y \
    ros-jazzy-navigation2 \
    ros-jazzy-nav2-bringup \
    ros-jazzy-slam-toolbox \
    ros-jazzy-cv-bridge \
    ros-jazzy-rqt-reconfigure \
    ros-jazzy-robot-state-publisher \
    ros-jazzy-joint-state-publisher \
    ros-jazzy-teleop-twist-keyboard \
    && rm -rf /var/lib/apt/lists/*

# Isaac Sim specific environment variables
ENV OMNI_KIT_ALLOW_ROOT=1
ENV ACCEPT_EULA=Y
