# UNAL ROBOT DESCRIPTION - ROS2 Tutorial

## Package Overview

This package contains a differential drive robot model for ROS2 with Gazebo simulation support. The robot uses the `gazebo_ros_diff_drive` plugin for realistic physics simulation and control.

### Package Structure
```
unal_robot_description/
├── model/
│   └── unal_robot.xacro          # Main robot XACRO file
├── launch/
│   ├── view_rviz.launch.py       # RViz visualization
│   ├── view_gazebo.launch.py     # Gazebo simulation
│   └── view_gazebo_rviz.launch.py # Combined Gazebo + RViz
├── rviz/
│   └── config.rviz               # RViz configuration
├── meshes/                       # 3D mesh files (if any)
├── package.xml                   # Package dependencies
├── CMakeLists.txt               # Build configuration
└── README.md                    # This file
```

---

## Exercise: Understanding the Differential Drive Implementation

This tutorial will walk you through the `unal_robot.xacro` file to understand how the `gazebo_ros_diff_drive` plugin is implemented.

### Step 1: Examine the Robot Structure

Open the file `model/unal_robot.xacro` and identify the following components:

#### Required Links:
- **`base_link`**: Main body of the robot (0.6m × 0.4m × 0.2m)
- **`left_wheel`**: Left drive wheel (radius: 0.1m)
- **`right_wheel`**: Right drive wheel (radius: 0.1m)
- **`caster_wheel`**: Free-rolling support wheel (radius: 0.05m)

#### Required Joints:
- **`left_wheel_joint`**: Continuous joint for left wheel
- **`right_wheel_joint`**: Continuous joint for right wheel
- **`caster_wheel_joint`**: Fixed joint for caster wheel

### Step 2: Locate the Differential Drive Plugin

Add the `<gazebo>` section in `unal_robot.xacro` that contains the differential drive plugin:

```xml
<gazebo>
  <plugin name="differential_drive_controller" filename="libgazebo_ros_diff_drive.so">
    <update_rate>50</update_rate>
    <left_joint>left_wheel_joint</left_joint>
    <right_joint>right_wheel_joint</right_joint>
    <wheel_separation>0.45</wheel_separation>
    <wheel_diameter>0.2</wheel_diameter>
    <wheel_acceleration>1.0</wheel_acceleration>
    <wheel_torque>20</wheel_torque>
    <command_topic>cmd_vel</command_topic>
    <odometry_topic>odom</odometry_topic>
    <odometry_frame>odom</odometry_frame>
    <robot_base_frame>base_link</robot_base_frame>
    <publish_odom>true</publish_odom>
    <publish_odom_tf>true</publish_odom_tf>
    <publish_wheel_tf>true</publish_wheel_tf>
  </plugin>
</gazebo>
```

### Step 3: Understand Plugin Parameters

#### Essential Parameters:
- **`left_joint`**: `left_wheel_joint` - References the left wheel joint
- **`right_joint`**: `right_wheel_joint` - References the right wheel joint
- **`wheel_separation`**: `0.45` - Distance between wheel centers (meters)
- **`wheel_diameter`**: `0.2` - Diameter of the wheels (meters)

#### Control Parameters:
- **`command_topic`**: `/cmd_vel` - Topic for velocity commands
- **`odometry_topic`**: `/odom` - Topic for odometry data
- **`update_rate`**: `50` - Control loop frequency (Hz)

#### Frame Parameters:
- **`odometry_frame`**: `odom` - Frame for odometry data
- **`robot_base_frame`**: `base_link` - Base frame of the robot

### Step 4: Examine Gazebo Physics Properties

Look for the Gazebo material properties that define wheel physics:

```xml
<gazebo reference="left_wheel">
  <material>Gazebo/Black</material>
  <mu1>0.2</mu1>          <!-- Friction coefficient 1 -->
  <mu2>0.2</mu2>          <!-- Friction coefficient 2 -->
  <kp>1000000.0</kp>      <!-- Contact stiffness -->
  <kd>100.0</kd>          <!-- Contact damping -->
  <minDepth>0.001</minDepth>
  <maxVel>1.0</maxVel>
  <fdir1>1 0 0</fdir1>
</gazebo>
```

---

## Hands-On Exercises

### Exercise 1: Build and Test the Package

1. **Build the package:**
   ```bash
   cd ~/ros2_ws
   colcon build --packages-select unal_robot_description
   source install/setup.bash
   ```

2. **Launch RViz visualization:**
   ```bash
   ros2 launch unal_robot_description view_rviz.launch.py
   ```
   - Observe the robot model
   - Check the TF tree
   - Verify the robot structure

3. **Launch Gazebo simulation:**
   ```bash
   ros2 launch unal_robot_description view_gazebo.launch.py
   ```
   - Watch the robot spawn in Gazebo
   - Notice the physics simulation

### Exercise 2: Test Robot Control

1. **Launch the complete simulation:**
   ```bash
   ros2 launch unal_robot_description view_gazebo_rviz.launch.py
   ```

2. **Test basic movement commands:**
   ```bash
   # Move forward
   ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "linear: {x: 0.5, y: 0.0, z: 0.0}
   angular: {x: 0.0, y: 0.0, z: 0.0}"

   # Turn left
   ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "linear: {x: 0.0, y: 0.0, z: 0.0}
   angular: {x: 0.0, y: 0.0, z: 0.5}"

   # Stop
   ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "linear: {x: 0.0, y: 0.0, z: 0.0}
   angular: {x: 0.0, y: 0.0, z: 0.0}"
   ```

3. **Monitor robot data:**
   ```bash
   # Check odometry
   ros2 topic echo /odom

   # Check robot description
   ros2 topic echo /robot_description

   # List all topics
   ros2 topic list
   ```

### Exercise 3: Modify Robot Parameters

1. **Change wheel separation:**
   - Edit `model/unal_robot.xacro`
   - Modify `<wheel_separation>0.45</wheel_separation>` to `<wheel_separation>0.5</wheel_separation>`
   - Rebuild and test

2. **Adjust wheel diameter:**
   - Change `<wheel_diameter>0.2</wheel_diameter>` to `<wheel_diameter>0.15</wheel_diameter>`
   - Rebuild and test

3. **Modify control parameters:**
   - Change `<update_rate>50</update_rate>` to `<update_rate>100</update_rate>`
   - Adjust `<wheel_torque>20</wheel_torque>` to `<wheel_torque>50</wheel_torque>`

### Exercise 4: Add Custom Topics

1. **Modify the plugin to use custom topics:**
   ```xml
   <command_topic>unal_robot/cmd_vel</command_topic>
   <odometry_topic>unal_robot/odom</odometry_topic>
   ```

2. **Test with new topics:**
   ```bash
   ros2 topic pub /unal_robot/cmd_vel geometry_msgs/msg/Twist "linear: {x: 0.3, y: 0.0, z: 0.0}
   angular: {x: 0.0, y: 0.0, z: 0.0}"
   ```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Robot Not Moving in Gazebo
**Symptoms:** Robot spawns but doesn't respond to `/cmd_vel` commands

**Solutions:**
- Check joint names match plugin parameters
- Verify wheel separation and diameter values
- Ensure Gazebo physics properties are correct
- Check if the plugin is loaded: `ros2 topic list | grep cmd_vel`

#### Issue 2: Robot Moving Erratically
**Symptoms:** Robot moves but behavior is unpredictable

**Solutions:**
- Adjust friction coefficients (`mu1`, `mu2`)
- Modify wheel acceleration and torque limits
- Check update rate setting
- Verify wheel geometry matches plugin parameters

#### Issue 3: No Odometry Data
**Symptoms:** `/odom` topic is empty or not published

**Solutions:**
- Ensure `publish_odom` is set to `true`
- Check frame names are correct
- Verify topic names match expected values
- Check if robot is actually moving

#### Issue 4: Build Errors
**Symptoms:** Package fails to build

**Solutions:**
- Check CMakeLists.txt includes correct directories
- Verify all dependencies are installed
- Clean and rebuild: `rm -rf build/ install/ log/ && colcon build`

---

## Advanced Modifications

### Adding Sensors

To add a laser scanner, add this to your XACRO file:

```xml
<!-- Laser Scanner -->
<link name="laser_link">
  <visual>
    <geometry>
      <cylinder radius="0.05" length="0.1"/>
    </geometry>
  </visual>
  <collision>
    <geometry>
      <cylinder radius="0.05" length="0.1"/>
    </geometry>
  </collision>
  <inertial>
    <mass value="0.1"/>
    <inertia ixx="0.001" ixy="0.0" ixz="0.0" iyy="0.001" iyz="0.0" izz="0.001"/>
  </inertial>
</link>

<joint name="laser_joint" type="fixed">
  <parent link="base_link"/>
  <child link="laser_link"/>
  <origin xyz="0.3 0.0 0.1" rpy="0 0 0"/>
</joint>

<!-- Gazebo Laser Plugin -->
<gazebo reference="laser_link">
  <sensor type="ray" name="laser_scanner">
    <pose>0 0 0 0 0 0</pose>
    <visualize>false</visualize>
    <update_rate>40</update_rate>
    <ray>
      <scan>
        <horizontal>
          <samples>720</samples>
          <resolution>1</resolution>
          <min_angle>-1.570796</min_angle>
          <max_angle>1.570796</max_angle>
        </horizontal>
      </scan>
      <range>
        <min>0.10</min>
        <max>30.0</max>
        <resolution>0.01</resolution>
      </range>
    </ray>
    <plugin name="gazebo_ros_laser" filename="libgazebo_ros_ray_sensor.so">
      <topicName>/scan</topicName>
      <frameName>laser_link</frameName>
    </plugin>
  </sensor>
</gazebo>
```

### Custom Control Topics

Modify the plugin to use custom namespaces:

```xml
<command_topic>robot/cmd_vel</command_topic>
<odometry_topic>robot/odom</odometry_topic>
<odometry_frame>robot/odom</odometry_frame>
<robot_base_frame>robot/base_link</robot_base_frame>
```

---

## Next Steps

1. **Navigation**: Integrate with ROS2 navigation stack
2. **SLAM**: Add simultaneous localization and mapping
3. **Multi-robot**: Create multiple robot instances
4. **Custom Controllers**: Implement advanced control algorithms

---

## References

- [Gazebo ROS Diff Drive Plugin](http://gazebosim.org/tutorials?tut=ros_gzplugins)
- [ROS2 XACRO Tutorial](https://docs.ros.org/en/humble/Tutorials/Intermediate/URDF/Using-Xacro-to-Clean-Up-a-URDF-file.html)
- [Gazebo Physics Properties](http://gazebosim.org/tutorials?tut=physics_properties)