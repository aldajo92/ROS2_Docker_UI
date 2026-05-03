# angy_sim_topics

Minimal ROS 2 (Humble, `ament_cmake`, C++17) package that publishes two
topics at 1 Hz so you can verify them with `ros2 topic list` and
`ros2 topic echo`.

| Topic                   | Type                   | Description                          |
| ----------------------- | ---------------------- | ------------------------------------ |
| `/demo/string_message`  | `std_msgs/msg/String`  | "Hello from angy_sim_topics #N"      |
| `/demo/counter`         | `std_msgs/msg/Int32`   | Monotonically increasing counter `N` |

A single node (`demo_publisher`) owns both publishers and one wall
timer — no launch file, no parameters, no extra dependencies beyond
`rclcpp` and `std_msgs`.

## Layout

```
angy_sim_topics/
├── CMakeLists.txt
├── package.xml
├── README.md
├── launch/
│   └── demo_publisher.launch.py
└── src/
    └── demo_publisher.cpp
```

## Build & run (inside the container)

The commands below are written for the Docker container shipped with
this repo. Open a shell with `./scripts/bash.sh` (from the host) and
run them in `~/ros2_ws`.

```bash
# 1. Build only this package (or drop --packages-select to build all)
cd ~/ros2_ws
colcon build --packages-select angy_sim_topics

# 2. Source the overlay so `ros2 run` can find the executable
source install/setup.bash

# 3a. Start the node directly — keep this terminal open
ros2 run angy_sim_topics demo_publisher

# 3b. …or start it via the bundled Python launch file
ros2 launch angy_sim_topics demo_publisher.launch.py
```

The launch file accepts a few standard overrides:

```bash
# Custom node name, namespace and logger level
ros2 launch angy_sim_topics demo_publisher.launch.py \
    node_name:=demo \
    namespace:=robot1 \
    log_level:=debug
```

With `namespace:=robot1`, the topics become `/robot1/demo/string_message`
and `/robot1/demo/counter`.

Expected log lines:

```
[INFO] [demo_publisher]: demo_publisher up: publishing /demo/string_message and /demo/counter at 1 Hz
[INFO] [demo_publisher]: Published string='Hello from angy_sim_topics #0', counter=0
[INFO] [demo_publisher]: Published string='Hello from angy_sim_topics #1', counter=1
...
```

## Verify the topics

In **another shell** inside the container (`./scripts/bash.sh` again,
then `source ~/ros2_ws/install/setup.bash`):

```bash
# Both topics should appear in the list
ros2 topic list
# Expected (among others):
#   /demo/counter
#   /demo/string_message

# Stream the string topic
ros2 topic echo /demo/string_message
# data: 'Hello from angy_sim_topics #N'

# Stream the counter topic
ros2 topic echo /demo/counter
# data: N
```

You can also confirm the message types:

```bash
ros2 topic info /demo/string_message     # → Type: std_msgs/msg/String
ros2 topic info /demo/counter            # → Type: std_msgs/msg/Int32
```

## One-liner via the host helper

If you prefer to drive everything from the host (without an interactive
shell), the project ships `./scripts/bash.sh`, which runs a command
inside the running container:

```bash
# Build
./scripts/bash.sh "cd ~/ros2_ws && colcon build --packages-select angy_sim_topics"

# Run via `ros2 run`
./scripts/bash.sh "source ~/ros2_ws/install/setup.bash && ros2 run angy_sim_topics demo_publisher"

# Run via `ros2 launch`
./scripts/bash.sh "source ~/ros2_ws/install/setup.bash && ros2 launch angy_sim_topics demo_publisher.launch.py"
```
