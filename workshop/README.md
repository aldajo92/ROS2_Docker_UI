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

```bash
# Go to project folder ~/ROS2_Docker_UI/ros2_ws/src
cd ~/ROS2_Docker_UI/ros2_ws/src
git clone https://github.com/aldajo92/waver_description_ros2.git waver_description
```

```bash
# Go to project folder ~/ROS2_Docker_UI/ros2_ws/src
cd ~/ROS2_Docker_UI/ros2_ws/src
git clone https://github.com/aldajo92/data_plotter.git
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

Publisher Subscriber Tutorial:

[Understanding topics — ROS 2 Documentation: Humble  documentation](https://docs.ros.org/en/humble/Tutorials/Beginner-CLI-Tools/Understanding-ROS2-Topics/Understanding-ROS2-Topics.html)

[Writing a simple publisher and subscriber (C++) — ROS 2 Documentation: Humble  documentation](https://docs.ros.org/en/humble/Tutorials/Beginner-Client-Libraries/Writing-A-Simple-Cpp-Publisher-And-Subscriber.html)