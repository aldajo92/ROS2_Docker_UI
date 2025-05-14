# ROS2 Workshop

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

```bash
# ROS2 Commands

# Compiles the project, make sure you are in ~/ROS2_Docker_UI/ros2_ws
colcon build

# Source the project, needed for ROS2
source ~/ROS2_Docker_UI/ros2_ws/install/setup.bash

ros2 topic list
ros2 topic echo <topic_name>

ros2 node list
```

## Publisher Subscriber Tutorial
- [Understanding topics — ROS 2 Documentation: Humble documentation](https://docs.ros.org/en/humble/Tutorials/Beginner-CLI-Tools/Understanding-ROS2-Topics/Understanding-ROS2-Topics.html)

- [Writing a simple publisher and subscriber (C++) — ROS 2 Documentation: Humble documentation](https://docs.ros.org/en/humble/Tutorials/Beginner-Client-Libraries/Writing-A-Simple-Cpp-Publisher-And-Subscriber.html)
