FROM osrf/ros:humble-desktop

ENV ROS_DISTRO=humble
RUN apt-get install ros-${ROS_DISTRO}-ros-gz

# see `cat /ros_entrypoint.sh` for more details
# ENTRYPOINT [ "/ros_entrypoint.sh" ]
