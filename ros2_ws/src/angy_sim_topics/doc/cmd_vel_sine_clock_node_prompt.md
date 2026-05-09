# Prompt: Add a `/clock`-Driven Sinusoidal `/cmd_vel` Publisher

You are working in the ROS 2 package `ros2_ws/src/angy_sim_topics`.

Add a new C++ ROS 2 node that publishes `geometry_msgs/msg/Twist` commands to `/cmd_vel`. The command must have constant linear velocity and sinusoidal angular velocity computed from simulation time received on the `/clock` topic.

## Goal

Create a new executable node, for example:

```bash
ros2 run angy_sim_topics cmd_vel_sine_clock_publisher
```

The node should publish:

```text
cmd_vel.linear.x  = constant_linear_velocity
cmd_vel.angular.z = angular_amplitude * sin(2 * pi * frequency_hz * t)
```

where:

- `t` is simulation time in seconds, derived from incoming `/clock` messages.
- `frequency_hz` is a configurable frequency constant.
- `angular_amplitude` is configurable.
- `constant_linear_velocity` is configurable.

## Important Time Requirement

The node must respond to `/clock`, not wall-clock time.

Subscribe to:

```text
/clock
```

with type:

```text
rosgraph_msgs/msg/Clock
```

On every received `/clock` message:

1. Convert `msg.clock` to seconds.
2. Use the first received clock value as `t0`.
3. Compute relative simulation time:

   ```text
   t = current_clock_time - t0
   ```

4. Publish one `geometry_msgs/msg/Twist` message to `cmd_vel`.

This makes the command deterministic with simulation playback and pause/resume behavior. If `/clock` stops advancing, the node should stop producing new command samples unless a new `/clock` message arrives.

## Topic Naming

Use a relative publisher topic by default:

```cpp
this->create_publisher<geometry_msgs::msg::Twist>("cmd_vel", 10);
```

With no namespace, this resolves to `/cmd_vel`. With a namespace, it becomes `/<namespace>/cmd_vel`, which is usually preferred for multi-robot setups.

Subscribe to `/clock` explicitly, because `/clock` is normally a global simulation-time topic:

```cpp
this->create_subscription<rosgraph_msgs::msg::Clock>(
  "/clock",
  10,
  ...
);
```

## Parameters

Declare ROS parameters with sensible defaults:

```text
linear_velocity_mps: 0.5
angular_amplitude_radps: 1.0
frequency_hz: 0.2
cmd_vel_topic: "cmd_vel"
clock_topic: "/clock"
```

Use these parameters when creating publishers/subscribers and computing the command.

Validate parameters conservatively:

- `frequency_hz >= 0`
- `angular_amplitude_radps >= 0`
- `linear_velocity_mps` may be positive, zero, or negative.
- Empty topic names should be rejected or replaced with defaults.

## Package Changes

Update `package.xml`:

```xml
<depend>geometry_msgs</depend>
<depend>rosgraph_msgs</depend>
```

Update `CMakeLists.txt`:

```cmake
find_package(geometry_msgs REQUIRED)
find_package(rosgraph_msgs REQUIRED)

add_executable(cmd_vel_sine_clock_publisher src/cmd_vel_sine_clock_publisher.cpp)
ament_target_dependencies(cmd_vel_sine_clock_publisher
  rclcpp
  geometry_msgs
  rosgraph_msgs
)

install(TARGETS demo_publisher cmd_vel_sine_clock_publisher
  DESTINATION lib/${PROJECT_NAME}
)
```

Preserve the existing `demo_publisher` executable.

## Suggested Node Structure

Create:

```text
src/cmd_vel_sine_clock_publisher.cpp
```

Implement a class like:

```cpp
class CmdVelSineClockPublisher : public rclcpp::Node
```

The class should own:

- `rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr cmd_vel_publisher_;`
- `rclcpp::Subscription<rosgraph_msgs::msg::Clock>::SharedPtr clock_subscription_;`
- parameter fields for linear velocity, angular amplitude, frequency, and topic names.
- an optional `rclcpp::Time first_clock_time_;`
- a boolean such as `has_first_clock_time_`.

In the `/clock` callback:

```cpp
const rclcpp::Time current_time(msg->clock);
if (!has_first_clock_time_) {
  first_clock_time_ = current_time;
  has_first_clock_time_ = true;
}

const double t = (current_time - first_clock_time_).seconds();

geometry_msgs::msg::Twist cmd;
cmd.linear.x = linear_velocity_mps_;
cmd.angular.z =
  angular_amplitude_radps_ * std::sin(2.0 * M_PI * frequency_hz_ * t);

cmd_vel_publisher_->publish(cmd);
```

Include `<cmath>` and define pi portably if needed:

```cpp
constexpr double kPi = 3.14159265358979323846;
```

Avoid relying on `M_PI` unless the project already uses it.

## Optional Launch File

Add:

```text
launch/cmd_vel_sine_clock_publisher.launch.py
```

Expose launch arguments for:

- `node_name`
- `namespace`
- `log_level`
- `linear_velocity_mps`
- `angular_amplitude_radps`
- `frequency_hz`
- `cmd_vel_topic`
- `clock_topic`

The launch file should pass these values as ROS parameters.

## Validation Commands

Build:

```bash
colcon build --packages-select angy_sim_topics
source install/setup.bash
```

Run the node:

```bash
ros2 run angy_sim_topics cmd_vel_sine_clock_publisher
```

In another terminal, publish test clock messages:

```bash
ros2 topic pub /clock rosgraph_msgs/msg/Clock "{clock: {sec: 0, nanosec: 0}}" --once
ros2 topic pub /clock rosgraph_msgs/msg/Clock "{clock: {sec: 1, nanosec: 0}}" --once
ros2 topic pub /clock rosgraph_msgs/msg/Clock "{clock: {sec: 2, nanosec: 0}}" --once
```

Echo `/cmd_vel`:

```bash
ros2 topic echo /cmd_vel
```

Expected behavior:

- A `Twist` message is published whenever a `/clock` message arrives.
- `linear.x` remains constant.
- `angular.z` follows the sine wave over simulation time.
- If no `/clock` messages arrive, no new command samples are produced.

## Acceptance Criteria

- The package builds with `colcon build --packages-select angy_sim_topics`.
- `ros2 run angy_sim_topics cmd_vel_sine_clock_publisher` starts successfully.
- The node subscribes to `/clock`.
- The node publishes `geometry_msgs/msg/Twist` on `/cmd_vel` by default.
- Published commands use simulation time from `/clock`, not wall time.
- The implementation follows the existing `angy_sim_topics` C++/`rclcpp` style.
