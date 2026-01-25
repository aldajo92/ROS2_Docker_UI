# ROS2 Workshop

This workshop provides a straightforward introduction to using the ROS2 environment with Docker. It's designed to help beginners quickly get started and interact with ROS2 without the hassle of manual setup.


## Basic bash commands

```bash
# current location
pwd

# change directory
cd /folder

# back
cd ..

# list files
ls
```

## Waver simulation
In the git branch `waver`, a simulation with a robot has been created to make some interaction with nav2, rviz and gazebo. To make the branch update follow this spteps:

```bash
git checkout waver                          # changed to branch
git submodule update --init --recursive     # get all submodules
```

## ROS Commands (run inside of the container)
```bash
# ROS2 Commands: make sure you are in the path ~/ros2_ws

# Compiles the project
colcon build

# Build specific packages
colcon build --packages-select <package_name>

# Compile using symbolic links (faster builds, especially for development)
colcon build --symlink-install

# Source the project, needed for ROS2
source ~/ros2_ws/install/setup.bash

ros2 topic list
ros2 topic echo <topic_name>

ros2 node list
```

## Execute navigation examples
```bash
ros2 launch waver_bringup sim_mapping.launch.py
ros2 launch waver_bringup sim_map_server.launch.py
ros2 launch waver_bringup sim_localization.launch.py
ros2 launch waver_bringup sim_navigation.launch.py
```

## Publisher Subscriber Tutorial
- [Understanding topics — ROS 2 Documentation: Humble documentation](https://docs.ros.org/en/humble/Tutorials/Beginner-CLI-Tools/Understanding-ROS2-Topics/Understanding-ROS2-Topics.html)

- [Writing a simple publisher and subscriber (C++) — ROS 2 Documentation: Humble documentation](https://docs.ros.org/en/humble/Tutorials/Beginner-Client-Libraries/Writing-A-Simple-Cpp-Publisher-And-Subscriber.html)
