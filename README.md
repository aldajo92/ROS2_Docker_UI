# ROS2 DOCKER UI (Humble, Gazebo classic)

The workspace for this project is located in the [`ros2_ws`](./ros2_ws) directory mounted to the docker container.

## Run the Docker Container
To run the docker container, use the following command:

- First build the docker image:
    ```bash
    ./scripts/build
    ```

- Then run the docker container:
    ```bash
    ./scripts/run
    ```

## Create a ROS2 Package
Based on the [ROS2 tutorial](https://docs.ros.org/en/humble/Tutorials/Beginner-Client-Libraries/Creating-Your-First-ROS2-Package.html) use the following commands to create a new package in the [`ros2_ws/src`](./ros2_ws/src) workspace:

```bash
# once inside the docker container move to src directory in the workspace
cd /ros2_ws/src
```

```bash
ros2 pkg create --build-type ament_cmake ros_example_package --dependencies rclcpp
```

Open a new terminal, ouside of the container, located to this project, then run the following command to change the owner of the package to the current user:
```bash
chown -R $USER:$USER ./ros2_ws
chown -R $USER:$USER ./ros2_ws/src/ros_example_package
```

Build the workspace:
```bash
colcon build
```

Source the workspace:
```bash
source /ros2_ws/install/setup.bash
```

Then you can edit the package files in the `ros2_ws/src/ros_example_package` directory using visual studio code or any other editor. For this project, vscode is assumed as the editor.

```bash
code .
```
